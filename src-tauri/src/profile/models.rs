use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Game {
    #[serde(rename = "ats")]
    Ats,
    #[serde(rename = "ets2")]
    Ets2,
}

/// How a game installation was discovered.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum InstallSource {
    Native,
    CrossOver,
    Proton,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameInstallation {
    pub game: Game,
    pub base_path: String,
    pub profiles_path: String,
    /// True if user-added via settings, false if auto-detected.
    #[serde(default)]
    pub is_custom: bool,
    pub source: InstallSource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileSummary {
    pub name: String,
    pub directory_name: String,
    pub path: String,
    pub company_name: Option<String>,
    pub save_count: usize,
    pub last_modified: Option<String>,
    /// True if this profile's data comes from Steam Cloud (steam_profiles/ + userdata).
    #[serde(default)]
    pub is_steam_cloud: bool,
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
    /// RFC 3339 timestamp of profile creation.
    pub creation_time: Option<String>,
    /// RFC 3339 timestamp of last save.
    pub save_time: Option<String>,
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

/// Whether a mod is currently loaded by the profile.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ModStatus {
    /// Present on disk and listed in the profile's `active_mods`.
    Active,
    /// Present on disk but not in `active_mods`.
    Inactive,
    /// Listed in `active_mods` but the file is missing.
    Missing,
}

/// Where a mod file lives.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ModSource {
    /// Steam Workshop (subscribed via Steam client).
    Workshop,
    /// A local .scs file or directory under the game's `mod/` folder.
    Local,
}

/// Full mod info from filesystem scan + manifest parsing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullModInfo {
    /// Mod identifier (matches active_mods ID or derived from filename/path)
    pub id: String,
    /// Display name from manifest or filename
    pub display_name: String,
    pub status: ModStatus,
    pub source: ModSource,
    /// Author from manifest
    pub author: Option<String>,
    /// Version from manifest
    pub version: Option<String>,
    /// Category tags from manifest
    pub categories: Vec<String>,
    /// Compatible game versions from manifest
    pub compatible_versions: Vec<String>,
    /// File size in bytes (for .scs files)
    pub size: Option<u64>,
    /// Steam Workshop item ID (for workshop mods)
    pub workshop_id: Option<String>,
}

// --- Clone options ---

/// How `active_mods` should be rewritten in the cloned profile.
///
/// Making this an enum eliminates the illegal `filter_mods: false,
/// include_mods: [...]` state that the old boolean-plus-list encoding allowed.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ModCloneStrategy {
    /// Copy every active_mods entry from the source profile verbatim.
    #[default]
    KeepAll,
    /// Keep only the mods whose id is in this list, in source order.
    IncludeOnly { mods: Vec<String> },
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CloneOptions {
    /// Specific file paths (relative to profile root) to include
    pub include_files: Vec<String>,
    /// Specific directory paths (relative to profile root) to include
    pub include_dirs: Vec<String>,
    /// Specific save directory names to include (empty = none)
    pub include_saves: Vec<String>,
    #[serde(default)]
    pub mod_strategy: ModCloneStrategy,
    /// If true, preserve online_user_name and online_password; if false, clear them
    #[serde(default)]
    pub include_online_profile: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub profile_name: String,
    pub game: Game,
    pub created_at: String,
}
