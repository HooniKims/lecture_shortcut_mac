use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
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

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TargetKind {
    App,
    Window,
    Tab,
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TabMode {
    #[default]
    Detach,
    Window,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub label: String,
    pub shortcut: String,
    pub target: Target,
    #[serde(default)]
    pub tab_mode: TabMode,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub restore: bool,
    pub standby: bool,
    pub display_id: Option<String>,
    pub panel_shortcut: String,
    pub capture_shortcut: String,
    pub send_shortcut: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
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

#[derive(Clone, Serialize, Deserialize)]
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

#[derive(Clone, Serialize, Deserialize)]
pub struct NativeReply {
    pub ok: bool,
    pub error: Option<String>,
    pub targets: Option<Vec<Target>>,
    pub displays: Option<Vec<Display>>,
    pub permissions: Option<Permissions>,
    pub target: Option<Target>,
    pub outcome: Option<String>,
    pub warnings: Option<Vec<String>>,
}
