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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveSummary {
    pub name: String,
    pub directory_name: String,
    pub path: String,
    pub last_modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloneOptions {
    /// Include all save game directories
    pub include_saves: bool,
    /// Include config.cfg
    pub include_config: bool,
    /// Include screenshots
    pub include_screenshots: bool,
    /// Specific save directory names to include (empty = all when include_saves is true)
    pub selected_saves: Vec<String>,
}

impl Default for CloneOptions {
    fn default() -> Self {
        Self {
            include_saves: true,
            include_config: true,
            include_screenshots: true,
            selected_saves: Vec::new(),
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
