use std::{sync::Arc, time::Duration};

use anyhow::{anyhow, bail, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::{
    async_runtime::{self, JoinHandle},
    AppHandle, Manager,
};
use tokio::sync::Mutex;

use crate::{
    api::{
        requests::BungieResponseError,
        responses::{ActivityInfo, CompletedActivity, LatestCharacterActivity, ProfileInfo},
        Api, ApiError, Source,
    },
    config::profiles::Profile,
    consts::{DUNGEON_ACTIVITY_MODE, RAID_ACTIVITY_MODE, STRIKE_ACTIVITY_MODE, LOSTSECTOR_ACTIVITY_MODE},
    ConfigContainer,
};

#[derive(Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerData {
    pub current_activity: CurrentActivity,
    pub activity_history: Vec<CompletedActivity>,
    pub profile_info: ProfileInfo,
}

#[derive(Serialize, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerDataStatus {
    pub last_update: Option<PlayerData>,
    pub error: Option<String>,
    pub history_loading: bool,
}

#[derive(Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentActivity {
    pub start_date: DateTime<Utc>,
    pub activity_hash: usize,
    pub activity_info: Option<ActivityInfo>,
}

#[derive(Default)]
pub struct PlayerDataPoller {
    task_handle: Option<JoinHandle<()>>,
    current_playerdata: Arc<Mutex<PlayerDataStatus>>,
}

impl PlayerDataPoller {
    pub async fn reset(&mut self, app_handle: AppHandle) {
        if let Some(t) = self.task_handle.as_ref() {
            t.abort();
        }

        {
            let mut lock = self.current_playerdata.lock().await;
            *lock = PlayerDataStatus {
                last_update: None,
                error: None,
                history_loading: false,
            };

            send_data_update(&app_handle, lock.clone()).await;
        }

        let playerdata_clone = self.current_playerdata.clone();

        self.task_handle = Some(async_runtime::spawn(async move {
            let profile = {
                let container = app_handle.state::<ConfigContainer>();
                let lock = container.0.lock().await;

                match &lock.get_profiles().selected_profile {
                    Some(p) => p.clone(),
                    None => {
                        let mut lock = playerdata_clone.lock().await;
                        lock.error = Some("No profile set".to_string());

                        send_data_update(&app_handle, lock.clone()).await;
                        return;
                    }
                }
            };

            let profile_info = {
                let api = app_handle.state::<Api>();
                let mut lock = api.profile_info_source.lock().await;

                match lock.get(&profile).await {
                    Ok(p) => p,
                    Err(e) => {
                        let mut lock = playerdata_clone.lock().await;
                        lock.error = Some(format!("Failed to get profile info: {e}"));

                        send_data_update(&app_handle, lock.clone()).await;
                        return;
                    }
                }
            };

            let mut current_activity = CurrentActivity {
                start_date: DateTime::<Utc>::MIN_UTC,
                activity_hash: 0,
                activity_info: None,
            };
            
            let res = update_current(&app_handle, &mut current_activity, &profile).await;

            {
                let mut lock = playerdata_clone.lock().await;
                match res {
                    Ok(_) => {
                        let playerdata = PlayerData {
                            current_activity: current_activity,
                            activity_history: Vec::new(),
                            profile_info,
                        };

                        lock.last_update = Some(playerdata);
                        lock.history_loading = true;
                        send_data_update(&app_handle, lock.clone()).await;
                    }
                    Err(e) => {
                        lock.error = Some(e.to_string());
                        send_data_update(&app_handle, lock.clone()).await;
                        return;
                    }
                }
            }

            if let Err(e) = load_history_incremental(&app_handle, &playerdata_clone, &profile).await {
                let mut lock = playerdata_clone.lock().await;
                lock.error = Some(format!("Failed to load activity history: {e}"));
                lock.history_loading = false;
                send_data_update(&app_handle, lock.clone()).await;
            }

            let mut count = 0;

            loop {
                tokio::time::sleep(Duration::from_secs(2)).await;

                let mut last_update = playerdata_clone.lock().await.last_update.clone().unwrap();

                let res = if count < 5 {
                    update_current(&app_handle, &mut last_update.current_activity, &profile).await
                } else {
                    count = 0;
                    update_history(&app_handle, &mut last_update.activity_history, &profile).await
                };

                match res {
                    Ok(true) => {
                        let mut lock = playerdata_clone.lock().await;
                        lock.error = None;
                        lock.last_update = Some(last_update);

                        send_data_update(&app_handle, lock.clone()).await;
                    }
                    Err(e) => {
                        let mut lock = playerdata_clone.lock().await;
                        lock.error = Some(e.to_string());

                        send_data_update(&app_handle, lock.clone()).await;
                    }
                    _ => (),
                }

                count += 1;
            }
        }));
    }

    pub fn get_data(&mut self) -> Option<PlayerDataStatus> {
        return match &self.current_playerdata.try_lock() {
            Ok(p) => Some((*p).clone()),
            Err(_) => None,
        };
    }
}

async fn send_data_update(handle: &AppHandle, data: PlayerDataStatus) {
    if let Some(o) = handle.get_window("overlay") {
        o.emit("playerdata_update", data.clone()).unwrap();
    }

    if let Some(o) = handle.get_window("details") {
        o.emit("playerdata_update", data.clone()).unwrap();
    }
    
    if let Some(ref player_data) = data.last_update {
        if let Some(timer_container) = handle.try_state::<crate::TimerPollerContainer>() {
            let handle_clone = handle.clone();
            let player_data_clone = player_data.clone();
            let timer_container_clone = timer_container.clone();
            
            timer_container_clone.0.lock().await.update_from_player_data(&player_data_clone, &handle_clone).await;
        }
    }
}

fn dedup_activities_prioritizing_completed(activities: Vec<CompletedActivity>) -> Vec<CompletedActivity> {
    let mut deduped_activities = Vec::new();
    let mut seen_instances = std::collections::HashSet::new();
    
    for activity in activities {
        let instance_key = &activity.instance_id;
        if seen_instances.insert(instance_key.clone()) {
            deduped_activities.push(activity);
        } else {
            if let Some(existing) = deduped_activities.iter_mut().find(|a| a.instance_id == *instance_key) {
                if !existing.completed && activity.completed {
                    *existing = activity;
                }
            }
        }
    }
    
    deduped_activities
}

async fn update_current(
    handle: &AppHandle,
    last_activity: &mut CurrentActivity,
    profile: &Profile,
) -> Result<bool> {
    let current_activities = Api::get_profile_activities(profile).await?;

    let activities = match current_activities.activities {
        Some(a) => a,
        None => bail!("Profile is private"),
    };

    let (characters, activities): (Vec<String>, Vec<LatestCharacterActivity>) =
        activities.into_iter().unzip();

    let latest_activity = activities
        .into_iter()
        .max()
        .ok_or(anyhow!("No character data for profile"))?;

    match last_activity
        .start_date
        .cmp(&latest_activity.date_activity_started)
    {
        std::cmp::Ordering::Less => {
            last_activity.start_date = latest_activity.date_activity_started
        }
        std::cmp::Ordering::Equal => {
            if last_activity.activity_info.is_none() {
                return Ok(false);
            }

            if last_activity.activity_hash == latest_activity.current_activity_hash {
                return Ok(false);
            }
        }
        std::cmp::Ordering::Greater => return Ok(false),
    }

    let api = handle.state::<Api>();

    api.profile_info_source
        .lock()
        .await
        .set_characters(profile, characters);

    if latest_activity.current_activity_hash == 0 {
        last_activity.activity_info = None;
        return Ok(true);
    }

    let current_activity_info = {
        let activity = api
            .activity_info_source
            .lock()
            .await
            .get(&latest_activity.current_activity_hash)
            .await;

        match activity {
            Ok(a) => a,
            Err(ApiError::ResponseError(BungieResponseError::ResponseMissing)) => {
                last_activity.activity_info = None;
                return Ok(true);
            }
            Err(e) => return Err(e.into()),
        }
    };

    if current_activity_info.name.is_empty() {
        last_activity.activity_info = None;
        return Ok(true);
    }

    last_activity.activity_hash = latest_activity.current_activity_hash;
    last_activity.activity_info = Some(current_activity_info);

    Ok(true)
}

async fn load_history_incremental(
    handle: &AppHandle,
    playerdata_clone: &Arc<Mutex<PlayerDataStatus>>,
    profile: &Profile,
) -> Result<()> {
    let api = handle.state::<Api>();


    let profile_info = api.profile_info_source.lock().await.get(profile).await?;
    
    let mut all_activities: Vec<CompletedActivity> = Vec::new();
    let mut master_list: Vec<CompletedActivity> = Vec::new();
    let mut activities_sent = 0;
    let mut total_api_calls = 0;
    let cutoff = Utc::now() - chrono::Duration::days(30);

    const INSTANT_COUNT: usize = 20;
    const BATCH_SIZE: usize = 50;
    let mut last_ui_update = std::time::Instant::now();
    const UI_UPDATE_INTERVAL: Duration = Duration::from_millis(1000);

    for (char_index, character_id) in profile_info.character_ids.iter().enumerate() {
        let mut page = 0;

        loop {
            total_api_calls += 1;
            
            let api_start = std::time::Instant::now();
            let history = Api::get_activity_history(profile, character_id, page).await?;
            let api_duration = api_start.elapsed();

            let activities = match history.activities {
                Some(a) => {
                    a
                },
                None => {
                    break;
                }
            };

            let mut includes_past_cutoff = false;
            let mut valid_activities_this_page = 0;

            for activity in activities.into_iter() {
                if activity.period < cutoff {
                    includes_past_cutoff = true;
                } else if activity.modes.iter().any(|m| {
                    *m == RAID_ACTIVITY_MODE
                        || *m == DUNGEON_ACTIVITY_MODE
                        || *m == STRIKE_ACTIVITY_MODE
                        || *m == LOSTSECTOR_ACTIVITY_MODE
                }) {
                    all_activities.push(activity);
                    valid_activities_this_page += 1;
                }
            }
            

            let previous_master_len = master_list.len();
            master_list.extend(all_activities[previous_master_len..].to_vec());
            
            master_list.sort();
            master_list.reverse();
            master_list = dedup_activities_prioritizing_completed(master_list);
            
            all_activities.sort();
            all_activities.reverse();

            if activities_sent < INSTANT_COUNT && activities_sent < all_activities.len() {
                let send_count = std::cmp::min(INSTANT_COUNT - activities_sent, all_activities.len() - activities_sent);
                if send_count > 0 {
                    let end_index = std::cmp::min(activities_sent + send_count, all_activities.len());
                    let chunk = &all_activities[activities_sent..end_index];
                    {
                        let mut lock = playerdata_clone.lock().await;
                        if let Some(ref mut last_update) = lock.last_update {
                            last_update.activity_history.extend(chunk.to_vec());
                            send_data_update(&handle, lock.clone()).await;
                        }
                    }
                    activities_sent += send_count;
                }
            } else if master_list.len() > activities_sent {
                let remaining = master_list.len() - activities_sent;
                let send_count = std::cmp::min(BATCH_SIZE, remaining);
                let end_index = std::cmp::min(activities_sent + send_count, master_list.len());
                let chunk = &master_list[activities_sent..end_index];
                
                let now = std::time::Instant::now();
                let should_update = now.duration_since(last_ui_update) >= UI_UPDATE_INTERVAL || 
                                   activities_sent + send_count >= master_list.len();
                
                if should_update {
                    {
                        let mut lock = playerdata_clone.lock().await;
                        if let Some(ref mut last_update) = lock.last_update {
                            last_update.activity_history = master_list[0..activities_sent + send_count].to_vec();
                            send_data_update(&handle, lock.clone()).await;
                        }
                    }
                    last_ui_update = now;
                    activities_sent += send_count;
                } else {
                    activities_sent += send_count;
                }
                
                if activities_sent < master_list.len() {
                    tokio::time::sleep(Duration::from_millis(200)).await;
                }
            }

            if includes_past_cutoff {
                break;
            }

            page += 1;
        }
    }


    master_list.sort();
    master_list.reverse();
    
    master_list = dedup_activities_prioritizing_completed(master_list);
    
    while activities_sent < master_list.len() {
        let remaining = master_list.len() - activities_sent;
        let send_count = std::cmp::min(BATCH_SIZE, remaining);
        let end_index = std::cmp::min(activities_sent + send_count, master_list.len());
        {
            let mut lock = playerdata_clone.lock().await;
            if let Some(ref mut last_update) = lock.last_update {
                last_update.activity_history = master_list[0..activities_sent + send_count].to_vec();
                send_data_update(&handle, lock.clone()).await;
            }
        }
        activities_sent += send_count;
        if activities_sent < master_list.len() {
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    }


    {
        let mut lock = playerdata_clone.lock().await;
        lock.history_loading = false;
        send_data_update(&handle, lock.clone()).await;
    }

    Ok(())
}

async fn update_history(
    handle: &AppHandle,
    last_history: &mut Vec<CompletedActivity>,
    profile: &Profile,
) -> Result<bool> {
    let api = handle.state::<Api>();

    let profile_info = api.profile_info_source.lock().await.get(profile).await?;

    let mut past_activities: Vec<CompletedActivity> = Vec::new();

    let cutoff = {
        Utc::now() - chrono::Duration::days(30)
    };

    for character_id in profile_info.character_ids.iter() {
        let mut page = 0;

        loop {
            let history = Api::get_activity_history(profile, character_id, page).await?;

            let activities = match history.activities {
                Some(a) => a,
                None => break,
            };

            let mut includes_past_cutoff = false;

            for activity in activities.into_iter() {
                if activity.period < cutoff {
                    includes_past_cutoff = true;
                } else if activity.modes.iter().any(|m| {
                    *m == RAID_ACTIVITY_MODE
                        || *m == DUNGEON_ACTIVITY_MODE
                        || *m == STRIKE_ACTIVITY_MODE
                        || *m == LOSTSECTOR_ACTIVITY_MODE
                }) {
                    past_activities.push(activity);
                }
            }

            if includes_past_cutoff {
                break;
            }

            page += 1;
        }
    }

    if let Some(last) = last_history.iter().max() {
        if let Some(new) = past_activities.iter().max() {
            if last >= new {
                return Ok(false);
            }
        }
    }

    past_activities.sort();
    past_activities.reverse();
    
    past_activities = dedup_activities_prioritizing_completed(past_activities);
    
    *last_history = past_activities;

    Ok(true)
}
