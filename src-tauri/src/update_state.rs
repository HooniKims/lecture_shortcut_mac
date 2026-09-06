use serde::Serialize;
use std::sync::{Mutex, atomic::AtomicBool};
use tauri_plugin_updater::Update;

#[derive(Clone, Default, Serialize)]
#[serde(tag = "phase", rename_all = "camelCase")]
pub enum Status {
    #[default]
    Idle,
    Checking,
    Latest,
    Unavailable,
    Available {
        version: String,
        notes: String,
    },
    Downloading {
        version: String,
        downloaded: u64,
        total: Option<u64>,
    },
    Installing {
        version: String,
    },
    Ready {
        version: String,
    },
    Error {
        message: String,
    },
}
#[derive(Default)]
pub struct Updates {
    pub(crate) open_requested: AtomicBool,
    pub(crate) status: Mutex<Status>,
    pub(crate) pending: Mutex<Option<Update>>,
}
