use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("SII decode error: {0}")]
    SiiDecode(String),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Already exists: {0}")]
    AlreadyExists(String),

    #[error("Invalid name: {0}")]
    InvalidName(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Store error: {0}")]
    Store(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Steam Cloud conflict: {0}")]
    SteamCloudConflict(String),

    #[error("Backup corrupted: {0}")]
    BackupCorrupted(String),

    #[error("Playset not found: {0}")]
    PlaysetNotFound(String),

    #[error("Invalid playset: {0}")]
    PlaysetInvalid(String),

    #[error("Workshop API error: {0}")]
    WorkshopApiError(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Operation cancelled")]
    Cancelled,
}

impl AppError {
    fn kind(&self) -> &'static str {
        match self {
            Self::Io(_) => "io",
            Self::SiiDecode(_) => "siiDecode",
            Self::Parse(_) => "parse",
            Self::NotFound(_) => "notFound",
            Self::AlreadyExists(_) => "alreadyExists",
            Self::InvalidName(_) => "invalidName",
            Self::InvalidPath(_) => "invalidPath",
            Self::Store(_) => "store",
            Self::PermissionDenied(_) => "permissionDenied",
            Self::SteamCloudConflict(_) => "steamCloudConflict",
            Self::BackupCorrupted(_) => "backupCorrupted",
            Self::PlaysetNotFound(_) => "playsetNotFound",
            Self::PlaysetInvalid(_) => "playsetInvalid",
            Self::WorkshopApiError(_) => "workshopApiError",
            Self::Network(_) => "network",
            Self::Cancelled => "cancelled",
        }
    }
}

// Serialized as `{ kind: "...", message: "..." }`. The frontend validates the
// shape with `AppErrorSchema` and narrows on `kind` via a discriminated union.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("kind", self.kind())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

impl From<tauri_plugin_store::Error> for AppError {
    fn from(e: tauri_plugin_store::Error) -> Self {
        Self::Store(e.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_connect() || e.is_timeout() || e.is_request() {
            Self::Network(e.to_string())
        } else {
            Self::WorkshopApiError(e.to_string())
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        Self::Parse(e.to_string())
    }
}
