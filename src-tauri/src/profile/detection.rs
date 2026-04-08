use std::path::PathBuf;

use crate::error::AppError;
use crate::profile::models::{Game, GameInstallation};

fn home_dir() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(PathBuf::from)
}

/// Known macOS game user data paths (per official SCS documentation).
fn game_base_paths() -> Vec<(Game, PathBuf)> {
    let Some(home) = home_dir() else {
        return Vec::new();
    };
    vec![
        (
            Game::Ats,
            home.join("Library/Application Support/American Truck Simulator"),
        ),
        (
            Game::Ets2,
            home.join("Library/Application Support/Euro Truck Simulator 2"),
        ),
    ]
}

/// Detect installed games by checking if the expected paths exist
/// and contain a profiles directory.
pub fn detect_installations() -> Result<Vec<GameInstallation>, AppError> {
    let mut installations = Vec::new();

    for (game, base_path) in game_base_paths() {
        let profiles_path = base_path.join("profiles");
        if profiles_path.exists() && profiles_path.is_dir() {
            installations.push(GameInstallation {
                game,
                base_path: base_path.to_string_lossy().to_string(),
                profiles_path: profiles_path.to_string_lossy().to_string(),
            });
        }
    }

    Ok(installations)
}

/// Check if a custom path is a valid game installation.
pub fn validate_game_path(path: &str) -> Option<Game> {
    let path = PathBuf::from(path);
    let profiles_path = path.join("profiles");
    if !profiles_path.exists() || !profiles_path.is_dir() {
        return None;
    }

    let path_str = path.to_string_lossy().to_lowercase();
    if path_str.contains("american truck") || path_str.contains("ats") {
        Some(Game::Ats)
    } else if path_str.contains("euro truck") || path_str.contains("ets2") {
        Some(Game::Ets2)
    } else {
        Some(Game::Ats)
    }
}
