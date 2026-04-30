use std::fs;
use std::path::{Path, PathBuf};

use tauri::ipc::Channel;

use crate::error::AppError;
use crate::profile::manager::decode_profile_name;
use crate::profile::models::BackupInfo;
use crate::progress::{CancelRegistry, ProgressEmitter, ProgressEvent};
use crate::utils;

fn default_backup_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")))
        .join("SII Mac")
        .join("backups")
}

/// Remove a partially-created staging directory, logging (but not erroring) on
/// failure. Called from the cleanup path of both backup and restore, where we
/// already have a higher-level error to return and swallowing the rmdir error
/// would be worse than surfacing it in the log.
fn cleanup_staging(staging: &Path) {
    if !staging.exists() {
        return;
    }
    if let Err(e) = fs::remove_dir_all(staging) {
        crate::warn_fallback!(
            "cleanup_staging: failed to remove {}: {e}",
            staging.display()
        );
    }
}

#[tauri::command]
pub fn backup_profile(
    cancel_registry: tauri::State<'_, CancelRegistry>,
    profile_path: String,
    backup_dir: Option<String>,
    job_id: String,
    progress: Channel<ProgressEvent>,
) -> Result<String, AppError> {
    let guard = cancel_registry.register(job_id);
    let mut emitter = ProgressEmitter::new(progress).with_cancel_flag(guard.flag());

    let mut staging: Option<PathBuf> = None;

    let result = (|| -> Result<String, AppError> {
        let source = Path::new(&profile_path);
        if !source.exists() {
            return Err(AppError::NotFound(format!(
                "Profile not found: {profile_path}"
            )));
        }

        let backup_base = backup_dir
            .map(PathBuf::from)
            .unwrap_or_else(default_backup_dir);
        fs::create_dir_all(&backup_base)?;

        let dir_name = source
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let profile_name = decode_profile_name(&dir_name).unwrap_or_else(|| dir_name.clone());

        let game = detect_game_from_path(&profile_path);
        let is_steam_cloud = looks_like_steam_cloud_path(&profile_path);

        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let backup_name = format!("{profile_name}_{timestamp}");
        let backup_path = backup_base.join(&backup_name);

        if backup_path.exists() {
            return Err(AppError::AlreadyExists(format!(
                "Backup target already exists: {}",
                backup_path.display()
            )));
        }

        // Stage into a sibling `.staging` dir first so a crash / cancel / IO
        // error never leaves a half-written backup under a name that
        // `list_backups` would surface. Only the final atomic rename publishes
        // the backup.
        let staging_path = backup_base.join(format!("{backup_name}.staging"));
        if staging_path.exists() {
            cleanup_staging(&staging_path);
        }
        staging = Some(staging_path.clone());

        let total = utils::count_files_recursive(source);
        emitter.started(format!("Backing up {profile_name}"), Some(total));

        let mut copied: u64 = 0;
        utils::copy_dir_with_progress(
            source,
            &staging_path,
            &mut |rel| {
                copied += 1;
                emitter.progress(copied, Some(total), rel.display().to_string());
            },
            &|| guard.check(),
        )?;

        let metadata = serde_json::json!({
            "profile_name": profile_name,
            "source_path": profile_path,
            "game": game,
            "is_steam_cloud": is_steam_cloud,
            "created_at": chrono::Utc::now().to_rfc3339(),
        });
        fs::write(
            staging_path.join(".backup_metadata.json"),
            serde_json::to_string_pretty(&metadata).map_err(|e| AppError::Parse(e.to_string()))?,
        )?;

        fs::rename(&staging_path, &backup_path)?;
        staging = None;

        Ok(backup_path.to_string_lossy().to_string())
    })();

    if result.is_err() {
        if let Some(staging_path) = staging {
            cleanup_staging(&staging_path);
        }
    }

    match &result {
        Ok(_) => emitter.completed("Backup complete"),
        Err(AppError::Cancelled) => emitter.cancelled(),
        Err(e) => emitter.failed(e.to_string()),
    }
    result
}

/// Heuristic: does this profile path live under a Steam Cloud-managed location?
///
/// Steam Cloud profiles are either under Steam's userdata tree
/// (`.../Steam/userdata/{uid}/{appid}/remote/profiles/{HEX}`) or under the
/// per-game stub `steam_profiles/` directory that the manager falls back to.
fn looks_like_steam_cloud_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    let userdata_remote = lower.contains("userdata")
        && (lower.contains("remote/profiles") || lower.contains("remote\\profiles"));
    let stub = lower.contains("steam_profiles");
    userdata_remote || stub
}

#[tauri::command]
pub fn list_backups(backup_dir: Option<String>) -> Result<Vec<BackupInfo>, AppError> {
    let backup_base = backup_dir
        .map(PathBuf::from)
        .unwrap_or_else(default_backup_dir);

    if !backup_base.exists() {
        return Ok(Vec::new());
    }

    let mut backups = Vec::new();
    for entry in fs::read_dir(&backup_base)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }

        let file_name = entry.file_name();
        let name_str = file_name.to_string_lossy();
        if name_str.ends_with(".staging") || name_str.ends_with(".restoring") {
            continue;
        }

        let metadata_path = entry.path().join(".backup_metadata.json");
        if !metadata_path.exists() {
            continue;
        }

        let metadata_str = fs::read_to_string(&metadata_path)?;
        match serde_json::from_str::<serde_json::Value>(&metadata_str) {
            Ok(metadata) => {
                let game = match metadata["game"].as_str() {
                    Some("ets2") => crate::profile::models::Game::Ets2,
                    _ => crate::profile::models::Game::Ats,
                };
                backups.push(BackupInfo {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: entry.path().to_string_lossy().to_string(),
                    profile_name: metadata["profile_name"]
                        .as_str()
                        .unwrap_or("Unknown")
                        .to_string(),
                    game,
                    created_at: metadata["created_at"].as_str().unwrap_or("").to_string(),
                });
            }
            Err(e) => {
                crate::warn_fallback!(
                    "list_backups: corrupt metadata at {}: {e} — backup hidden from UI",
                    metadata_path.display()
                );
            }
        }
    }

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(backups)
}

#[tauri::command]
pub fn restore_backup(
    cancel_registry: tauri::State<'_, CancelRegistry>,
    backup_path: String,
    profiles_dir: String,
    job_id: String,
    progress: Channel<ProgressEvent>,
) -> Result<String, AppError> {
    let guard = cancel_registry.register(job_id);
    let mut emitter = ProgressEmitter::new(progress).with_cancel_flag(guard.flag());

    let mut staging: Option<PathBuf> = None;

    let result = (|| -> Result<String, AppError> {
        let source = Path::new(&backup_path);
        if !source.exists() {
            return Err(AppError::NotFound(format!(
                "Backup not found: {backup_path}"
            )));
        }

        let metadata_path = source.join(".backup_metadata.json");
        let metadata_str = fs::read_to_string(&metadata_path)
            .map_err(|_| AppError::NotFound("Backup metadata not found".to_string()))?;
        let metadata: serde_json::Value = serde_json::from_str(&metadata_str)
            .map_err(|e| AppError::Parse(format!("Invalid backup metadata: {e}")))?;

        let profile_name = metadata["profile_name"]
            .as_str()
            .ok_or_else(|| AppError::Parse("Missing profile_name in metadata".to_string()))?;
        let is_steam_cloud = metadata["is_steam_cloud"].as_bool().unwrap_or(false);
        let original_source = metadata["source_path"].as_str().unwrap_or_default();

        // For Steam Cloud backups, prefer restoring to the original Steam userdata
        // parent so the game actually picks up the restored data and syncs it back
        // to the cloud. Falling back to the caller-provided `profiles_dir` for a
        // Steam Cloud backup would write to local disk silently and the user would
        // wonder why their progress isn't syncing.
        let dest_dir: PathBuf = if is_steam_cloud {
            let original_parent = Path::new(original_source).parent().map(PathBuf::from);
            match original_parent {
                Some(parent) if parent.exists() => parent,
                _ => {
                    return Err(AppError::InvalidPath(format!(
                        "This backup is a Steam Cloud profile from `{original_source}`. \
                         The original Steam userdata directory is no longer reachable, \
                         so restoring to `{profiles_dir}` would write to local disk and \
                         the profile would not sync back to Steam Cloud. Re-open Steam \
                         on this machine or specify a Steam Cloud remote directory."
                    )));
                }
            }
        } else {
            PathBuf::from(&profiles_dir)
        };

        if !dest_dir.exists() {
            return Err(AppError::NotFound(format!(
                "Profiles directory not found: {}",
                dest_dir.display()
            )));
        }

        let dir_name = crate::profile::manager::encode_profile_name(profile_name);
        let dest = dest_dir.join(&dir_name);

        if dest.exists() {
            return Err(AppError::AlreadyExists(format!(
                "Profile '{profile_name}' already exists at destination"
            )));
        }

        // Stage into a sibling `.restoring` dir so a cancel / IO error during
        // copy never leaves a partial profile directory visible to the game.
        // Only the final rename promotes the staging tree to the real profile
        // directory.
        let staging_path = dest_dir.join(format!("{dir_name}.restoring"));
        if staging_path.exists() {
            cleanup_staging(&staging_path);
        }
        staging = Some(staging_path.clone());

        let total = utils::count_files_recursive(source);
        emitter.started(format!("Restoring {profile_name}"), Some(total));

        let mut copied: u64 = 0;
        utils::copy_dir_with_progress(
            source,
            &staging_path,
            &mut |rel| {
                copied += 1;
                emitter.progress(copied, Some(total), rel.display().to_string());
            },
            &|| guard.check(),
        )?;

        // Drop the metadata sidecar from the staged profile so the game
        // doesn't see it when the rename promotes the directory.
        let staged_metadata = staging_path.join(".backup_metadata.json");
        if staged_metadata.exists() {
            if let Err(e) = fs::remove_file(&staged_metadata) {
                return Err(AppError::Io(std::io::Error::new(
                    e.kind(),
                    format!(
                        "failed to remove backup metadata from staged profile at {}: {e}",
                        staged_metadata.display()
                    ),
                )));
            }
        }

        fs::rename(&staging_path, &dest)?;
        staging = None;

        Ok(dest.to_string_lossy().to_string())
    })();

    if result.is_err() {
        if let Some(staging_path) = staging {
            cleanup_staging(&staging_path);
        }
    }

    match &result {
        Ok(_) => emitter.completed("Restore complete"),
        Err(AppError::Cancelled) => emitter.cancelled(),
        Err(e) => emitter.failed(e.to_string()),
    }
    result
}

/// Detect game type from a profile path.
///
/// First walks up the path looking for a real game-base directory
/// (`gamedata.manifest.sii` marker via `detection::validate_game_path`), which
/// is authoritative. Falls back to a case-insensitive substring match against
/// the game's marketing name — only meant for unusual install layouts where
/// the structural check doesn't resolve. As a last resort defaults to `"ats"`
/// with a warning, so a misclassified backup can be traced.
fn detect_game_from_path(path: &str) -> &'static str {
    use crate::profile::detection;
    let mut dir = std::path::Path::new(path);
    while let Some(parent) = dir.parent() {
        if let Some(game) = detection::validate_game_path(&parent.to_string_lossy()) {
            return match game {
                crate::profile::models::Game::Ets2 => "ets2",
                crate::profile::models::Game::Ats => "ats",
            };
        }
        dir = parent;
    }

    let lowered = path.to_ascii_lowercase();
    if lowered.contains("euro truck simulator 2") || lowered.contains("ets2") {
        return "ets2";
    }
    if lowered.contains("american truck simulator") {
        return "ats";
    }

    crate::warn_fallback!(
        "detect_game_from_path: no game marker in `{path}` — defaulting to ats"
    );
    "ats"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_steam_cloud_detection_userdata_unix() {
        assert!(looks_like_steam_cloud_path(
            "/Users/x/Library/Application Support/Steam/userdata/12345/270880/remote/profiles/54"
        ));
        assert!(looks_like_steam_cloud_path(
            "/home/u/.steam/steam/userdata/12345/270880/remote/profiles/54"
        ));
    }

    #[test]
    fn test_steam_cloud_detection_userdata_windows() {
        assert!(looks_like_steam_cloud_path(
            "C:\\Program Files\\Steam\\userdata\\12345\\270880\\remote\\profiles\\54"
        ));
    }

    #[test]
    fn test_steam_cloud_detection_stub_dir() {
        assert!(looks_like_steam_cloud_path(
            "/Users/x/Documents/American Truck Simulator/steam_profiles/54657374"
        ));
    }

    #[test]
    fn test_steam_cloud_detection_rejects_local() {
        assert!(!looks_like_steam_cloud_path(
            "/Users/x/Documents/American Truck Simulator/profiles/54657374"
        ));
        assert!(!looks_like_steam_cloud_path(
            "C:\\Users\\x\\Documents\\Euro Truck Simulator 2\\profiles\\54"
        ));
    }

    #[test]
    fn test_detect_game_from_path_matches_case_insensitively() {
        // Lowercase fallback: every pattern should match regardless of case.
        assert_eq!(
            detect_game_from_path("/home/u/Games/EURO TRUCK SIMULATOR 2/profiles/54"),
            "ets2"
        );
        assert_eq!(
            detect_game_from_path("/home/u/ETS2/profiles/54"),
            "ets2"
        );
        assert_eq!(
            detect_game_from_path("/Users/x/Documents/American Truck Simulator/profiles/54"),
            "ats"
        );
    }

    #[test]
    fn test_detect_game_from_path_defaults_to_ats_on_unknown() {
        // No marker at all: should default to ats (documented behavior).
        assert_eq!(
            detect_game_from_path("/some/arbitrary/profile/location/54"),
            "ats"
        );
    }

    #[test]
    fn test_list_backups_skips_staging_and_restoring_dirs() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();

        // One valid backup
        let valid = base.join("MyProfile_20260101_120000");
        fs::create_dir_all(&valid).unwrap();
        fs::write(
            valid.join(".backup_metadata.json"),
            r#"{"profile_name":"MyProfile","source_path":"/ignored","game":"ats","is_steam_cloud":false,"created_at":"2026-01-01T12:00:00Z"}"#,
        )
        .unwrap();

        // One in-flight staging dir that must be hidden
        let staging = base.join("Other_20260101_120500.staging");
        fs::create_dir_all(&staging).unwrap();
        fs::write(
            staging.join(".backup_metadata.json"),
            r#"{"profile_name":"Other","created_at":"2026-01-01T12:05:00Z"}"#,
        )
        .unwrap();

        // And an in-flight restoring dir
        let restoring = base.join("ReStoring.restoring");
        fs::create_dir_all(&restoring).unwrap();
        fs::write(
            restoring.join(".backup_metadata.json"),
            r#"{"profile_name":"X","created_at":"2026-01-01T13:00:00Z"}"#,
        )
        .unwrap();

        let backups = list_backups(Some(base.to_string_lossy().to_string())).unwrap();
        assert_eq!(backups.len(), 1, "only the finalized backup should show");
        assert_eq!(backups[0].profile_name, "MyProfile");
    }

    #[test]
    fn test_cleanup_staging_removes_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let staging = tmp.path().join("fake.staging");
        fs::create_dir_all(staging.join("nested")).unwrap();
        fs::write(staging.join("nested/file.txt"), b"data").unwrap();
        assert!(staging.exists());
        cleanup_staging(&staging);
        assert!(!staging.exists(), "staging dir must be removed");
    }

    #[test]
    fn test_cleanup_staging_noop_on_missing_path() {
        // Non-existent path: must not panic or warn loudly.
        let tmp = tempfile::tempdir().unwrap();
        cleanup_staging(&tmp.path().join("does_not_exist"));
    }
}
