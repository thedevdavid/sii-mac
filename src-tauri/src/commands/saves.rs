use std::fs;
use std::path::Path;

use crate::error::AppError;
use crate::profile::manager;
use crate::profile::models::SaveSummary;
use crate::utils::format_modified_time;
use serde::{Deserialize, Serialize};

#[tauri::command]
pub fn list_saves(profile_path: String) -> Result<Vec<SaveSummary>, AppError> {
    manager::list_saves_in_profile(&profile_path)
}

/// One backup snapshot of `game.sii`, as produced by the writer's
/// `atomic_replace_verified` flow. Two kinds exist:
///
/// - `previous`: the rotating `.bak`, captured immediately before the most
///   recent edit. Useful for "undo my last save change".
/// - `original`: the sticky `.bak.original`, captured immediately before the
///   first edit ever made to this save. Useful for "roll all the way back to
///   how the game last wrote this save."
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveBackupInfo {
    pub kind: SaveBackupKind,
    pub path: String,
    pub modified_at: Option<String>,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SaveBackupKind {
    Previous,
    Original,
}

#[tauri::command]
pub fn list_save_backups(save_path: String) -> Result<Vec<SaveBackupInfo>, AppError> {
    let dir = Path::new(&save_path);
    let mut out = Vec::new();
    for (kind, name) in [
        (SaveBackupKind::Previous, "game.sii.bak"),
        (SaveBackupKind::Original, "game.sii.bak.original"),
    ] {
        let p = dir.join(name);
        let Ok(meta) = fs::metadata(&p) else {
            continue;
        };
        out.push(SaveBackupInfo {
            kind,
            path: p.to_string_lossy().to_string(),
            modified_at: format_modified_time(&p),
            size_bytes: meta.len(),
        });
    }
    Ok(out)
}

/// Roll `game.sii` back to one of the writer-produced backups. Before
/// overwriting we re-snapshot the *current* `game.sii` into `.bak` so the user
/// can undo the restore. We never delete `.bak.original` — it's sticky by
/// design, and we want a future "restore to original" to keep working.
#[tauri::command]
pub fn restore_save_backup(save_path: String, kind: SaveBackupKind) -> Result<(), AppError> {
    let dir = Path::new(&save_path);
    let game_sii = dir.join("game.sii");
    let backup = match kind {
        SaveBackupKind::Previous => dir.join("game.sii.bak"),
        SaveBackupKind::Original => dir.join("game.sii.bak.original"),
    };

    if !backup.exists() {
        return Err(AppError::NotFound(format!(
            "Backup not found: {}",
            backup.display()
        )));
    }

    if game_sii.exists() {
        let rotating = dir.join("game.sii.bak");
        if rotating != backup {
            fs::copy(&game_sii, &rotating)?;
        }
    }
    fs::copy(&backup, &game_sii)?;
    Ok(())
}
