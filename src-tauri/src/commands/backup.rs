use std::fs;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::profile::manager::decode_profile_name;
use crate::profile::models::BackupInfo;

fn default_backup_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home).join("Library/Application Support/SII Mac/backups")
}

#[tauri::command]
pub fn backup_profile(
    profile_path: String,
    backup_dir: Option<String>,
) -> Result<String, AppError> {
    let source = Path::new(&profile_path);
    if !source.exists() {
        return Err(AppError::NotFound(format!(
            "Profile not found: {}",
            profile_path
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

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let backup_name = format!("{}_{}", profile_name, timestamp);
    let backup_path = backup_base.join(&backup_name);

    copy_dir_recursive(source, &backup_path)?;

    let metadata = serde_json::json!({
        "profile_name": profile_name,
        "source_path": profile_path,
        "created_at": chrono::Utc::now().to_rfc3339(),
    });
    fs::write(
        backup_path.join(".backup_metadata.json"),
        serde_json::to_string_pretty(&metadata).unwrap_or_default(),
    )?;

    Ok(backup_path.to_string_lossy().to_string())
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

        let metadata_path = entry.path().join(".backup_metadata.json");
        if !metadata_path.exists() {
            continue;
        }

        let metadata_str = fs::read_to_string(&metadata_path)?;
        if let Ok(metadata) = serde_json::from_str::<serde_json::Value>(&metadata_str) {
            backups.push(BackupInfo {
                name: entry.file_name().to_string_lossy().to_string(),
                path: entry.path().to_string_lossy().to_string(),
                profile_name: metadata["profile_name"]
                    .as_str()
                    .unwrap_or("Unknown")
                    .to_string(),
                game: crate::profile::models::Game::Ats,
                created_at: metadata["created_at"]
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
            });
        }
    }

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(backups)
}

#[tauri::command]
pub fn restore_backup(backup_path: String, profiles_dir: String) -> Result<String, AppError> {
    let source = Path::new(&backup_path);
    if !source.exists() {
        return Err(AppError::NotFound(format!(
            "Backup not found: {}",
            backup_path
        )));
    }

    let dest_dir = Path::new(&profiles_dir);
    if !dest_dir.exists() {
        return Err(AppError::NotFound(format!(
            "Profiles directory not found: {}",
            profiles_dir
        )));
    }

    let metadata_path = source.join(".backup_metadata.json");
    let metadata_str = fs::read_to_string(&metadata_path)
        .map_err(|_| AppError::NotFound("Backup metadata not found".to_string()))?;
    let metadata: serde_json::Value = serde_json::from_str(&metadata_str)
        .map_err(|e| AppError::Parse(format!("Invalid backup metadata: {}", e)))?;

    let profile_name = metadata["profile_name"]
        .as_str()
        .ok_or_else(|| AppError::Parse("Missing profile_name in metadata".to_string()))?;

    let dir_name = crate::profile::manager::encode_profile_name(profile_name);
    let dest = dest_dir.join(&dir_name);

    if dest.exists() {
        return Err(AppError::AlreadyExists(format!(
            "Profile '{}' already exists at destination",
            profile_name
        )));
    }

    copy_dir_recursive(source, &dest)?;

    // Remove metadata from restored profile
    let restored_metadata = dest.join(".backup_metadata.json");
    if restored_metadata.exists() {
        let _ = fs::remove_file(restored_metadata);
    }

    Ok(dest.to_string_lossy().to_string())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), AppError> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}
