use std::{sync::Arc, time::Duration};
use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

use crate::{
    api::responses::CompletedActivity,
    consts::EXCLUDED_ACTIVITY_HASHES,
    pollers::playerdata::{CurrentActivity, PlayerData},
};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    pub time_text: String,
    pub ms_text: String,
    pub is_active: bool,
    pub mode: TimerMode,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TimerMode {
    Default,
    Persistent,
}

#[derive(Clone)]
pub struct TimerConfig {
    pub display_milliseconds: bool,
    pub update_rate: u64,
}

impl Default for TimerConfig {
    fn default() -> Self {
        Self {
            display_milliseconds: true,
            update_rate: 16,
        }
    }
}

pub struct Timer {
    state: Arc<Mutex<TimerState>>,
    config: TimerConfig,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
    last_activity: Option<CurrentActivity>,
    known_completions: std::collections::HashSet<String>,
    last_completed_activity_hash: Option<usize>,
    interval_handle: Option<tokio::task::JoinHandle<()>>,
}

impl Timer {
    pub fn new(config: TimerConfig) -> Self {
        Self {
            state: Arc::new(Mutex::new(TimerState {
                time_text: String::new(),
                ms_text: String::new(),
                is_active: false,
                mode: TimerMode::Default,
            })),
            config,
            start_time: None,
            end_time: None,
            last_activity: None,
            known_completions: std::collections::HashSet::new(),
            last_completed_activity_hash: None,
            interval_handle: None,
        }
    }

    pub async fn set_mode(&mut self, mode: TimerMode, app_handle: &AppHandle) {
        let mut state = self.state.lock().await;
        let old_mode = state.mode.clone();
        state.mode = mode.clone();
        drop(state);

        self.emit_state_update(app_handle).await;
    }

    pub async fn get_mode(&self) -> TimerMode {
        let state = self.state.lock().await;
        state.mode.clone()
    }

    pub async fn start_activity(&mut self, activity: &CurrentActivity, activity_history: &[CompletedActivity], app_handle: &AppHandle) {
        if self.should_start_activity(activity, activity_history).await {
            self.last_activity = Some(activity.clone());
            self.start_time = Some(activity.start_date);
            self.end_time = None;

            self.start_timer_interval(app_handle).await;
        }
    }

    async fn should_start_activity(&self, activity: &CurrentActivity, activity_history: &[CompletedActivity]) -> bool {
        let state = self.state.lock().await;

        if state.mode == TimerMode::Persistent {
            if let Some(ref last_activity) = self.last_activity {
                if last_activity.activity_hash == activity.activity_hash && self.end_time.is_none() {
                    return false;
                }
            }

            if !activity_history.is_empty() {
                let last_activity_in_history = &activity_history[0];
                let last_activity_end_time = last_activity_in_history.period + chrono::Duration::seconds(last_activity_in_history.activity_duration_seconds as i64);
                let new_activity_start_time = activity.start_date;
                let buffer_time = chrono::Duration::seconds(40);

                if new_activity_start_time <= (last_activity_end_time - buffer_time) {
                    return false;
                }
            }
        }

        true
    }

    pub async fn check_activity_completed(&mut self, activity_history: &[CompletedActivity], app_handle: &AppHandle) {
        let state = self.state.lock().await;

        if state.mode != TimerMode::Persistent || self.last_activity.is_none() || activity_history.is_empty() {
            return;
        }

        let most_recent_activity = &activity_history[0];
        let completion_key = format!("{}_{}", most_recent_activity.activity_hash, most_recent_activity.period);

        if self.known_completions.contains(&completion_key) {
            return;
        }

        self.known_completions.insert(completion_key.clone());

        if let Some(ref last_activity) = self.last_activity {
            if most_recent_activity.activity_hash == last_activity.activity_hash {
                drop(state);

                if let Some(handle) = self.interval_handle.take() {
                    handle.abort();
                }

                self.end_time = Some(Utc::now());
                {
                    let mut state = self.state.lock().await;
                    state.is_active = false;
                }

                self.emit_state_update(app_handle).await;

                let state_clone = self.state.clone();
                let app_handle_clone = app_handle.clone();
                tokio::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    let mut state = state_clone.lock().await;
                    state.time_text.clear();
                    state.ms_text.clear();

                    if let Some(window) = app_handle_clone.get_window("details") {
                        let _ = window.emit("timer-state-update", &*state);
                    }
                    if let Some(window) = app_handle_clone.get_window("overlay") {
                        let _ = window.emit("timer-state-update", &*state);
                    }
                });

                self.last_activity = None;
            }
        }
    }

    pub async fn stop(&mut self, app_handle: &AppHandle) {
        if let Some(handle) = self.interval_handle.take() {
            handle.abort();
        }

        let mode = {
            let state = self.state.lock().await;
            state.mode.clone()
        };

        if mode == TimerMode::Persistent {
            if self.end_time.is_some() {
                let mut state = self.state.lock().await;
                state.is_active = false;
                state.time_text.clear();
                state.ms_text.clear();
            }
        } else {
            let mut state = self.state.lock().await;
            state.is_active = false;
            state.time_text.clear();
            state.ms_text.clear();
            self.start_time = None;
            self.last_activity = None;
            self.end_time = None;
        }

        self.emit_state_update(app_handle).await;
    }

    pub async fn reset(&mut self, app_handle: &AppHandle) {
        if let Some(handle) = self.interval_handle.take() {
            handle.abort();
        }

        let mut state = self.state.lock().await;
        state.is_active = false;
        state.time_text.clear();
        state.ms_text.clear();
        drop(state);

        self.start_time = None;
        self.last_activity = None;
        self.end_time = None;
        self.last_completed_activity_hash = None;
        self.known_completions.clear();

        self.emit_state_update(app_handle).await;
    }

    pub async fn clear_activity(&mut self, app_handle: &AppHandle) {
        if let Some(handle) = self.interval_handle.take() {
            handle.abort();
        }

        let mut state = self.state.lock().await;
        state.is_active = false;
        state.time_text = "--:--:--".to_string();
        state.ms_text.clear();
        drop(state);

        self.start_time = None;
        self.last_activity = None;
        self.end_time = None;
        self.known_completions.clear();

        self.emit_state_update(app_handle).await;
    }

    pub async fn clear_and_restart_activity(&mut self, player_data: &PlayerData, app_handle: &AppHandle) {
        if let Some(handle) = self.interval_handle.take() {
            handle.abort();
        }

        let mut state = self.state.lock().await;
        state.is_active = false;
        state.time_text.clear();
        state.ms_text.clear();
        drop(state);

        self.start_time = None;
        self.last_activity = None;
        self.end_time = None;

        if player_data.current_activity.activity_hash != 0
            && !EXCLUDED_ACTIVITY_HASHES.contains(&player_data.current_activity.activity_hash)
        {
            if let Some(ref activity_info) = player_data.current_activity.activity_info {
                if self.should_have_timer(activity_info) {
                    self.start_activity(&player_data.current_activity, &player_data.activity_history, app_handle).await;
                }
            }
        }

        self.emit_state_update(app_handle).await;
    }

    pub async fn restart_activity(&mut self, activity: &CurrentActivity, app_handle: &AppHandle) {
        self.last_activity = Some(activity.clone());
        self.start_time = Some(activity.start_date);
        self.end_time = None;

        self.start_timer_interval(app_handle).await;
    }

    pub fn is_tracking_activity(&self, activity_hash: usize) -> bool {
        if let Some(ref last_activity) = self.last_activity {
            last_activity.activity_hash == activity_hash && self.end_time.is_none()
        } else {
            false
        }
    }

    pub fn was_recently_completed(&self, activity_hash: usize) -> bool {
        self.last_completed_activity_hash == Some(activity_hash)
    }

    fn should_have_timer(&self, activity_info: &crate::api::responses::ActivityInfo) -> bool {
        const STORY_ACTIVITY_MODE: u32 = 2;
        const RAID_ACTIVITY_MODE: u32 = 4;
        const DUNGEON_ACTIVITY_MODE: u32 = 16;
        const STRIKE_ACTIVITY_MODE: u32 = 18;
        const LOSTSECTOR_ACTIVITY_MODE: u32 = 82;

        activity_info.activity_modes.iter().any(|&mode| {
            let mode = mode as u32;
            mode == STORY_ACTIVITY_MODE ||
            mode == RAID_ACTIVITY_MODE ||
            mode == DUNGEON_ACTIVITY_MODE ||
            mode == STRIKE_ACTIVITY_MODE ||
            mode == LOSTSECTOR_ACTIVITY_MODE
        })
    }

    async fn start_timer_interval(&mut self, app_handle: &AppHandle) {
        if let Some(handle) = self.interval_handle.take() {
            handle.abort();
        }

        let state_clone = self.state.clone();
        let start_time = self.start_time;
        let update_rate = self.config.update_rate;
        let app_handle_clone = app_handle.clone();

        {
            let mut state = state_clone.lock().await;
            state.is_active = true;
        }

        let handle = tokio::spawn(async move {
            let mut tick_count = 0u64;

            loop {
                tokio::time::sleep(Duration::from_millis(1000 / update_rate)).await;
                tick_count += 1;

                if tick_count > 3600 * update_rate {
                    if start_time.is_none() {
                        break;
                    }
                }

                if let Some(start_time) = start_time {
                    let elapsed = Utc::now() - start_time;
                    let millis = elapsed.num_milliseconds() as u64;

                    let (time_text, ms_text) = if millis > 0 {
                        let total_seconds = millis / 1000;
                        let hours = total_seconds / 3600;
                        let minutes = (total_seconds % 3600) / 60;
                        let seconds = total_seconds % 60;
                        let remaining_millis = millis % 1000;

                        let time_text = if hours > 0 {
                            format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
                        } else {
                            format!("{:02}:{:02}", minutes, seconds)
                        };

                        let ms_text = format!(":{:02}", remaining_millis / 10);
                        (time_text, ms_text)
                    } else {
                        (String::new(), String::new())
                    };

                    {
                        let mut state = state_clone.lock().await;
                        state.time_text = time_text;
                        state.ms_text = ms_text;
                    }

                    if let Ok(state_guard) = state_clone.try_lock() {
                        if let Some(window) = app_handle_clone.get_window("details") {
                            let _ = window.emit("timer-state-update", &*state_guard);
                        }
                        if let Some(window) = app_handle_clone.get_window("overlay") {
                            let _ = window.emit("timer-state-update", &*state_guard);
                        }
                    }
                } else {
                    break;
                }
            }
        });

        self.interval_handle = Some(handle);
    }

    async fn emit_state_update(&self, app_handle: &AppHandle) {
        if let Ok(state) = self.state.try_lock() {
            if let Some(window) = app_handle.get_window("details") {
                let _ = window.emit("timer-state-update", &*state);
            }
            if let Some(window) = app_handle.get_window("overlay") {
                let _ = window.emit("timer-state-update", &*state);
            }
        }
    }

    pub async fn get_state(&self) -> TimerState {
        let state = self.state.lock().await;
        state.clone()
    }
}

pub struct TimerPoller {
    timer: Arc<Mutex<Timer>>,
    task_handle: Option<tokio::task::JoinHandle<()>>,
}

impl Default for TimerPoller {
    fn default() -> Self {
        Self::new(TimerConfig::default())
    }
}

impl TimerPoller {
    pub fn new(config: TimerConfig) -> Self {
        Self {
            timer: Arc::new(Mutex::new(Timer::new(config))),
            task_handle: None,
        }
    }

    pub async fn reset(&mut self, app_handle: AppHandle) {
        if let Some(t) = self.task_handle.as_ref() {
            t.abort();
        }

        let mut timer = self.timer.lock().await;
        timer.reset(&app_handle).await;
    }

    pub async fn update_from_player_data(&self, player_data: &PlayerData, app_handle: &AppHandle) {
        let mut timer = self.timer.lock().await;

        if timer.get_mode().await == TimerMode::Persistent {
            timer
                .check_activity_completed(&player_data.activity_history, app_handle)
                .await;
        }
        if player_data.current_activity.activity_hash == 0 {
            if timer.get_mode().await == TimerMode::Default {
                timer.stop(app_handle).await;
            }
        } else if let Some(ref activity_info) = player_data.current_activity.activity_info {
            if timer.should_have_timer(activity_info) {
                timer.start_activity(&player_data.current_activity, &player_data.activity_history, app_handle).await;
            }
        }
    }

    pub async fn set_timer_mode(&self, mode: TimerMode, app_handle: &AppHandle) {
        let mut timer = self.timer.lock().await;
        timer.set_mode(mode, app_handle).await;
    }

    pub async fn clear_timer(&self, app_handle: &AppHandle) {
        let mut timer = self.timer.lock().await;
        timer.clear_activity(app_handle).await;
    }

    pub async fn clear_and_restart_timer(&self, player_data: &PlayerData, app_handle: &AppHandle) {
        let mut timer = self.timer.lock().await;
        timer.clear_and_restart_activity(player_data, app_handle).await;
    }

    pub async fn reset_timer(&self, app_handle: &AppHandle) {
        let mut timer = self.timer.lock().await;
        timer.reset(app_handle).await;
    }
}
