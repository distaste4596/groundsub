use serde::{Deserialize, Serialize};

use super::ConfigFile;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct Preferences {
    pub enable_overlay: bool,
    pub display_timer: bool,
    pub display_daily_clears: bool,
    pub display_icons: bool,
    pub display_clear_notifications: bool,
    pub display_milliseconds: bool,
    pub show_timestamp_instead: bool,
    pub use_real_time: bool,
    pub filter_activity_type: String,
    pub filter_timespan: String,
    pub timer_mode: String,
    pub raid_link_provider: String,
    pub primary_background: String,
    pub secondary_background: String,
    pub primary_highlight: String,
    pub clear_text_color: String,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            enable_overlay: false,
            display_timer: true,
            display_daily_clears: true,
            display_icons: true,
            display_clear_notifications: true,
            display_milliseconds: true,
            show_timestamp_instead: false,
            use_real_time: false,
            filter_activity_type: "all".to_string(),
            filter_timespan: "1".to_string(),
            timer_mode: "default".to_string(),
            raid_link_provider: "raid.report".to_string(),
            primary_background: "#12171c".to_string(),
            secondary_background: "#180f1c".to_string(),
            primary_highlight: "#74259c".to_string(),
            clear_text_color: "#ffffff".to_string(),
        }
    }
}

impl ConfigFile for Preferences {
    fn get_filename() -> &'static str {
        "preferences.json"
    }
}
