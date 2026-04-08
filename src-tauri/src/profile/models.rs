use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Game {
    #[serde(rename = "ats")]
    Ats,
    #[serde(rename = "ets2")]
    Ets2,
}

impl Game {
    pub fn display_name(&self) -> &str {
        match self {
            Game::Ats => "American Truck Simulator",
            Game::Ets2 => "Euro Truck Simulator 2",
        }
    }

    pub fn short_name(&self) -> &str {
        match self {
            Game::Ats => "ATS",
            Game::Ets2 => "ETS2",
        }
    }

    pub fn folder_name(&self) -> &str {
        match self {
            Game::Ats => "American Truck Simulator",
            Game::Ets2 => "Euro Truck Simulator 2",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameInstallation {
    pub game: Game,
    pub base_path: String,
    pub profiles_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileSummary {
    pub name: String,
    pub directory_name: String,
    pub path: String,
    pub company_name: Option<String>,
    pub save_count: usize,
    pub last_modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileDetail {
    pub name: String,
    pub directory_name: String,
    pub path: String,
    pub company_name: Option<String>,
    pub experience_points: Option<u64>,
    pub money: Option<u64>,
    pub save_count: usize,
    pub saves: Vec<SaveSummary>,
    pub last_modified: Option<String>,
    pub raw_profile_text: Option<String>,
    // Rich profile fields
    pub face: Option<u32>,
    pub brand: Option<String>,
    pub logo: Option<String>,
    pub male: Option<bool>,
    pub map_path: Option<String>,
    pub cached_experience: Option<u64>,
    pub cached_distance: Option<f64>,
    pub cached_stats: Option<Vec<u64>>,
    pub online_user_name: Option<String>,
    pub creation_time: Option<u64>,
    pub save_time: Option<u64>,
    pub version: Option<u32>,
    pub customization: Option<u32>,
    pub active_mods: Vec<ModEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveSummary {
    pub name: String,
    pub directory_name: String,
    pub path: String,
    pub last_modified: Option<String>,
}

// --- Profile content scanning ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileContents {
    /// Always-included files (profile.sii, profile.bak.sii)
    pub required_files: Vec<FileEntry>,
    /// Config files at profile root
    pub config_files: Vec<FileEntry>,
    /// Progress directories and files (academy, album, tutorial, session)
    pub progress_items: Vec<FileEntry>,
    /// Save game groups
    pub save_groups: Vec<SaveGroup>,
    /// Active mods from profile.sii
    pub active_mods: Vec<ModEntry>,
    /// Total size of the entire profile
    pub total_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    /// File or directory name
    pub name: String,
    /// Relative path from profile root
    pub path: String,
    /// Human-readable display name
    pub display_name: String,
    /// Size in bytes
    pub size: u64,
    /// Whether this is a directory
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveGroup {
    pub label: String,
    pub saves: Vec<SaveEntry>,
    pub total_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveEntry {
    pub directory_name: String,
    pub display_name: String,
    pub size: u64,
    pub last_modified: Option<String>,
    pub has_preview: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModEntry {
    /// Raw mod identifier (e.g. "mod_workshop_package.000000004D431C63")
    pub id: String,
    /// Display name (e.g. "SiSL's Trailer Pack USA")
    pub display_name: String,
}

// --- Clone options ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloneOptions {
    /// Specific file paths (relative to profile root) to include
    pub include_files: Vec<String>,
    /// Specific directory paths (relative to profile root) to include
    pub include_dirs: Vec<String>,
    /// Specific save directory names to include (empty = none)
    pub include_saves: Vec<String>,
    /// Mod IDs to activate in the cloned profile (empty = keep all from source)
    pub include_mods: Vec<String>,
    /// If true, include_mods is used to filter; if false, copy all mods as-is
    pub filter_mods: bool,
    /// If true, preserve online_user_name and online_password; if false, clear them
    #[serde(default)]
    pub include_online_profile: bool,
}

impl Default for CloneOptions {
    fn default() -> Self {
        Self {
            include_files: Vec::new(),
            include_dirs: Vec::new(),
            include_saves: Vec::new(),
            include_mods: Vec::new(),
            filter_mods: false,
            include_online_profile: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub profile_name: String,
    pub game: Game,
    pub created_at: String,
}
