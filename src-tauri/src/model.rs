use serde::{Deserialize, Serialize};

#[derive(Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub id: String,
    pub kind: TargetKind,
    pub app: String,
    pub bundle_id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tab_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<i32>,
}

#[derive(Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TargetKind {
    App,
    Window,
    Tab,
}

#[derive(Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TabMode {
    #[default]
    Detach,
    Window,
}

#[derive(Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub label: String,
    pub shortcut: String,
    pub target: Target,
    #[serde(default)]
    pub tab_mode: TabMode,
}

#[derive(Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    Studio,
    Paper,
}

impl Theme {
    pub const fn native(self) -> tauri::Theme {
        match self {
            Self::Studio => tauri::Theme::Dark,
            Self::Paper => tauri::Theme::Light,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_check_updates")]
    pub check_updates: bool,
    #[serde(default)]
    pub theme: Theme,
    pub restore: bool,
    pub standby: bool,
    pub display_id: Option<String>,
    pub panel_shortcut: String,
    pub capture_shortcut: String,
    pub send_shortcut: String,
}

fn default_check_updates() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: Theme::default(),
            check_updates: true,
            restore: true,
            standby: false,
            display_id: None,
            panel_shortcut: "CommandOrControl+Shift+Space".into(),
            capture_shortcut: "CommandOrControl+Shift+0".into(),
            send_shortcut: "CommandOrControl+Shift+Enter".into(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub entries: Vec<Entry>,
}

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct Config {
    #[serde(default)]
    pub entries: Vec<Entry>,
    #[serde(default)]
    pub settings: Settings,
    #[serde(default)]
    pub presets: Vec<Preset>,
}

#[derive(Clone, PartialEq, Serialize, Deserialize)]
pub struct Display {
    pub id: String,
    pub name: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub primary: bool,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Permissions {
    pub accessibility: bool,
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct NativeReply {
    #[serde(rename = "captureDisplay")]
    pub capture_display: Option<Display>,
    pub ok: bool,
    pub error: Option<String>,
    pub targets: Option<Vec<Target>>,
    pub displays: Option<Vec<Display>>,
    pub permissions: Option<Permissions>,
    pub target: Option<Target>,
    pub outcome: Option<String>,
    pub warnings: Option<Vec<String>>,
}
