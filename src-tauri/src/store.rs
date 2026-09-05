use crate::model::{Config, Display, Entry, Preset, Settings};
use std::{
    path::PathBuf,
    sync::{Mutex, atomic::AtomicBool},
};
use tauri::{AppHandle, Manager};

pub struct Store {
    pub config: Mutex<Config>,
    pub displays: Mutex<Option<(String, Vec<Display>)>>,
    pub prepared: Mutex<Option<String>>,
    pub busy: AtomicBool,
    pub recording: AtomicBool,
    pub startup_error: Mutex<Option<String>>,
    pub path: PathBuf,
}

impl Store {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join("config.json");
        let (mut config, startup_error) = if path.exists() {
            match std::fs::read(&path)
                .map_err(|e| e.to_string())
                .and_then(|b| serde_json::from_slice::<Config>(&b).map_err(|e| e.to_string()))
            {
                Ok(c) => (c, None),
                Err(e) => (
                    Config::default(),
                    Some(format!(
                        "저장 설정을 읽지 못했습니다. 원본 파일은 유지됩니다: {e}"
                    )),
                ),
            }
        } else {
            (Config::default(), None)
        };
        if !config.settings.restore {
            config.entries.clear();
        }
        Ok(Self {
            config: Mutex::new(config),
            displays: Mutex::new(None),
            prepared: Mutex::new(None),
            busy: AtomicBool::new(false),
            recording: AtomicBool::new(false),
            startup_error: Mutex::new(startup_error),
            path,
        })
    }

    pub fn persist(&self, config: &Config) -> Result<(), String> {
        if self
            .startup_error
            .lock()
            .map_err(|e| e.to_string())?
            .is_some()
            && self.path.exists()
        {
            let backup = self.path.with_extension("unreadable.json");
            if !backup.exists() {
                std::fs::copy(&self.path, backup).map_err(|e| e.to_string())?;
            }
        }
        #[derive(serde::Serialize)]
        struct DiskConfig<'a> {
            entries: &'a [Entry],
            settings: &'a Settings,
            presets: &'a [Preset],
        }
        let disk = DiskConfig {
            entries: if config.settings.restore {
                &config.entries
            } else {
                &[]
            },
            settings: &config.settings,
            presets: &config.presets,
        };
        let bytes = serde_json::to_vec_pretty(&disk).map_err(|e| e.to_string())?;
        let temp = self.path.with_extension("tmp");
        std::fs::write(&temp, bytes).map_err(|e| e.to_string())?;
        std::fs::rename(temp, &self.path).map_err(|e| e.to_string())
    }
}
