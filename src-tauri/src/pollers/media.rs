use serde::Serialize;
use tauri::{AppHandle, Manager};
use tokio::time::{sleep, Duration};
use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub track_number: u32,
    pub is_playing: bool,
    pub app_id: String,
    pub has_media: bool,
}

pub async fn media_poller(app_handle: AppHandle) {
    let mut last_info: Option<MediaInfo> = None;

    loop {
        match get_current_media_info().await {
            Ok(info) => {
                if info.is_playing {
                    let changed = last_info.as_ref().map_or(true, |last| {
                        last.title != info.title || last.artist != info.artist
                    });

                    if changed {
                        if let Err(e) = app_handle.emit_all("media-update", &info) {
                        }
                        last_info = Some(info);
                    }
                } else if last_info.as_ref().map_or(false, |l| l.has_media) {
                    let empty = MediaInfo::default();
                    if let Err(e) = app_handle.emit_all("media-update", &empty) {
                        eprintln!("Failed to emit media update: {}", e);
                    }
                    last_info = Some(empty);
                }
            }
            Err(_) => {
                if last_info.as_ref().map_or(false, |l| l.has_media) {
                    let empty = MediaInfo::default();
                    if let Err(e) = app_handle.emit_all("media-update", &empty) {
                        eprintln!("Failed to emit media update: {}", e);
                    }
                    last_info = Some(empty);
                }
            }
        }

        sleep(Duration::from_secs(2)).await;
    }
}

async fn get_current_media_info() -> Result<MediaInfo, String> {
    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?;
    let sessions = manager.GetSessions().map_err(|e| e.to_string())?;
    let count = sessions.Size().map_err(|e| e.to_string())?;

    if count == 0 {
        return Ok(MediaInfo::default());
    }

    for i in 0..count {
        let session = sessions.GetAt(i).map_err(|e| e.to_string())?;
        let properties = session
            .TryGetMediaPropertiesAsync()
            .map_err(|e| e.to_string())?
            .await
            .map_err(|e| e.to_string())?;
        let playback_info = session.GetPlaybackInfo().map_err(|e| e.to_string())?;

        let title = properties.Title().map_err(|e| e.to_string())?.to_string();
        let artist = properties.Artist().map_err(|e| e.to_string())?.to_string();

        if !title.is_empty() || !artist.is_empty() {
            return Ok(MediaInfo {
                title,
                artist,
                album: properties.AlbumTitle().map_err(|e| e.to_string())?.to_string(),
                album_artist: properties.AlbumArtist().map_err(|e| e.to_string())?.to_string(),
                track_number: properties.TrackNumber().map_err(|e| e.to_string())? as u32,
                is_playing: playback_info.PlaybackStatus().map_err(|e| e.to_string())?.0 == 4,
                app_id: session.SourceAppUserModelId().map_err(|e| e.to_string())?.to_string(),
                has_media: true,
            });
        }
    }

    Ok(MediaInfo::default())
}

#[tauri::command]
pub async fn get_current_media() -> Result<MediaInfo, String> {
    std::thread::spawn(|| -> Result<MediaInfo, String> {
        let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
        rt.block_on(get_current_media_info())
    })
    .join()
    .map_err(|_| "Thread panicked".to_string())?
    .map(|info| if info.is_playing { info } else { MediaInfo::default() })
}
