use serde::{Deserialize, Serialize};

use super::ConfigFile;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct Preferences {
    pub enable_overlay: bool,
    pub display_daily_clears: bool,
    pub display_clear_notifications: bool,
    pub display_milliseconds: bool,
    pub filter_activity_type: String,
    pub filter_timespan: String,
    pub primary_background: String,
    pub secondary_background: String,
    pub primary_highlight: String,
    pub clear_text_color: String,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            enable_overlay: false,
            display_daily_clears: true,
            display_clear_notifications: true,
            display_milliseconds: true,
            filter_activity_type: "all".to_string(),
            filter_timespan: "1".to_string(),
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
