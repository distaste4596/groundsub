use serde::{Deserialize, Serialize};

use super::ConfigFile;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct Preferences {
    pub enable_overlay: bool,
    pub display_timer: bool,
    pub display_daily_clears: bool,
    pub display_average_clear_time_overlay: bool,
    pub display_icons: bool,
    pub display_clear_notifications: bool,
    pub display_milliseconds: bool,
    pub show_timestamp_instead: bool,
    pub use_real_time: bool,
    pub display_average_clear_time_details: bool,
    pub display_difference_indicator: bool,
    pub filter_activity_type: String,
    pub filter_timespan: String,
    pub timer_mode: String,
    pub raid_link_provider: String,
    pub primary_background: String,
    pub secondary_background: String,
    pub primary_highlight: String,
    pub info_text_color: String,
    pub incomplete_color: String,
    pub completed_color: String,
    pub overlay_position: String,
    pub overlay_size: String,
    pub overlay_layout: String,
    pub custom_overlay_x: i32,
    pub custom_overlay_y: i32,
    pub custom_start_date: String,
    pub display_now_playing: bool,
    pub overlay_background_opacity: i32,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            enable_overlay: false,
            display_timer: true,
            display_daily_clears: true,
            display_average_clear_time_overlay: false,
            display_icons: true,
            display_clear_notifications: true,
            display_milliseconds: true,
            show_timestamp_instead: false,
            use_real_time: false,
            display_average_clear_time_details: false,
            display_difference_indicator: false,
            filter_activity_type: "all".to_string(),
            filter_timespan: "1".to_string(),
            timer_mode: "default".to_string(),
            raid_link_provider: "raid.report".to_string(),
            primary_background: "#12171c".to_string(),
            secondary_background: "#180f1c".to_string(),
            primary_highlight: "#74259c".to_string(),
            info_text_color: "#d2d8ed".to_string(),
            incomplete_color: "#ee3333".to_string(),
            completed_color: "#33ee33".to_string(),
            overlay_position: "left".to_string(),
            overlay_size: "medium".to_string(),
            overlay_layout: "horizontal".to_string(),
            custom_overlay_x: 0,
            custom_overlay_y: 0,
            custom_start_date: String::new(),
            display_now_playing: false,
            overlay_background_opacity: 0,
        }
    }
}

impl ConfigFile for Preferences {
    fn get_filename() -> &'static str {
        "preferences.json"
    }
}
