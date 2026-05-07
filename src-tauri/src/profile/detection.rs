//! Cross-platform game installation detection.
//! Scans native and CrossOver/Wine/Proton paths.
//! Also detects Steam Cloud profiles via `steam_profiles/` directory.

use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use crate::error::AppError;
use crate::profile::models::{Game, GameInstallation, InstallSource};

struct Candidate {
    game: Game,
    path: PathBuf,
    source: InstallSource,
}

/// Collect all candidate game paths for the current platform.
fn game_candidates() -> Vec<Candidate> {
    let mut candidates = Vec::new();

    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs::home_dir() {
            // Native macOS
            let support = home.join("Library/Application Support");
            candidates.push(Candidate {
                game: Game::Ats,
                path: support.join("American Truck Simulator"),
                source: InstallSource::Native,
            });
            candidates.push(Candidate {
                game: Game::Ets2,
                path: support.join("Euro Truck Simulator 2"),
                source: InstallSource::Native,
            });

            // CrossOver — Wine maps Windows Documents to ~/Documents/
            if let Some(docs) = dirs::document_dir() {
                candidates.push(Candidate {
                    game: Game::Ats,
                    path: docs.join("American Truck Simulator"),
                    source: InstallSource::CrossOver,
                });
                candidates.push(Candidate {
                    game: Game::Ets2,
                    path: docs.join("Euro Truck Simulator 2"),
                    source: InstallSource::CrossOver,
                });
            }
            // NOTE: We don't scan inside CrossOver bottles because their Documents
            // directories resolve to ~/Documents/ via symlinks/hardlinks anyway.
            // Scanning bottles would create duplicates.
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(docs) = dirs::document_dir() {
            candidates.push(Candidate {
                game: Game::Ats,
                path: docs.join("American Truck Simulator"),
                source: InstallSource::Native,
            });
            candidates.push(Candidate {
                game: Game::Ets2,
                path: docs.join("Euro Truck Simulator 2"),
                source: InstallSource::Native,
            });
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(data) = dirs::data_dir() {
            candidates.push(Candidate {
                game: Game::Ats,
                path: data.join("American Truck Simulator"),
                source: InstallSource::Native,
            });
            candidates.push(Candidate {
                game: Game::Ets2,
                path: data.join("Euro Truck Simulator 2"),
                source: InstallSource::Native,
            });
        }
        // Proton: `{steamapps}/compatdata/{app_id}/pfx/...`
        for steamapps in crate::steam::paths::steam_steamapps_roots() {
            let compat = steamapps.join("compatdata");
            for (game, app_id) in [
                (Game::Ats, crate::steam::paths::ATS_APP_ID),
                (Game::Ets2, crate::steam::paths::ETS2_APP_ID),
            ] {
                let prefix = compat
                    .join(app_id)
                    .join("pfx/drive_c/users/steamuser/Documents");
                let game_name = match &game {
                    Game::Ats => "American Truck Simulator",
                    Game::Ets2 => "Euro Truck Simulator 2",
                };
                candidates.push(Candidate {
                    game,
                    path: prefix.join(game_name),
                    source: InstallSource::Proton,
                });
            }
        }
    }

    candidates
}

/// Detect installed games.
/// Checks for both `profiles/` (local) and `steam_profiles/` (Steam Cloud) directories.
pub fn detect_installations() -> Result<Vec<GameInstallation>, AppError> {
    let mut installations = Vec::new();
    let mut seen_canonical = HashSet::new();

    for candidate in game_candidates() {
        let has_local = candidate.path.join("profiles").is_dir();
        let has_steam = candidate.path.join("steam_profiles").is_dir();

        if !has_local && !has_steam {
            continue;
        }

        // Deduplicate by canonical (real) path to avoid CrossOver symlink duplicates
        let canonical =
            fs::canonicalize(&candidate.path).unwrap_or_else(|_| candidate.path.clone());
        let canonical_str = canonical.to_string_lossy().to_string();
        if !seen_canonical.insert(canonical_str) {
            continue;
        }

        // Use the profiles_path that exists. Prefer local profiles/ but
        // the manager also needs to scan steam_profiles/.
        let profiles_path = if has_local {
            candidate.path.join("profiles")
        } else {
            // For Steam-only installs, the actual saves are in Steam userdata.
            // Point to steam_profiles/ so the manager knows this is a Steam Cloud install.
            candidate.path.join("steam_profiles")
        };

        installations.push(GameInstallation {
            game: candidate.game,
            base_path: candidate.path.to_string_lossy().to_string(),
            profiles_path: profiles_path.to_string_lossy().to_string(),
            is_custom: false,
            source: candidate.source,
        });
    }

    Ok(installations)
}

/// Detect installations including user-added custom paths.
pub fn detect_with_custom_paths(
    custom_paths: &[String],
) -> Result<Vec<GameInstallation>, AppError> {
    let mut installations = detect_installations()?;

    for path_str in custom_paths {
        if installations.iter().any(|i| i.base_path == *path_str) {
            continue;
        }

        let path = PathBuf::from(path_str);
        let has_local = path.join("profiles").is_dir();
        let has_steam = path.join("steam_profiles").is_dir();
        if !has_local && !has_steam {
            continue;
        }

        if let Some(game) = validate_game_path(path_str) {
            let profiles_path = if has_local {
                path.join("profiles")
            } else {
                path.join("steam_profiles")
            };
            installations.push(GameInstallation {
                game,
                base_path: path_str.clone(),
                profiles_path: profiles_path.to_string_lossy().to_string(),
                is_custom: true,
                source: InstallSource::Custom,
            });
        }
    }

    Ok(installations)
}

/// Check if a path is a valid game installation directory.
pub fn validate_game_path(path: &str) -> Option<Game> {
    let path = PathBuf::from(path);
    let has_profiles = path.join("profiles").is_dir();
    let has_steam = path.join("steam_profiles").is_dir();
    if !has_profiles && !has_steam {
        return None;
    }

    let path_str = path.to_string_lossy().to_lowercase();
    if path_str.contains("american truck") || path_str.contains("ats") {
        Some(Game::Ats)
    } else if path_str.contains("euro truck") || path_str.contains("ets2") {
        Some(Game::Ets2)
    } else if path.join("config.cfg").exists() {
        Some(Game::Ats)
    } else {
        None
    }
}
