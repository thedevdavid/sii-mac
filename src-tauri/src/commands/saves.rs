use std::fs;
use std::path::Path;
use std::time::SystemTime;

use crate::error::AppError;
use crate::profile::models::SaveSummary;
use crate::sii;

#[tauri::command]
pub fn list_saves(profile_path: String) -> Result<Vec<SaveSummary>, AppError> {
    let save_dir = Path::new(&profile_path).join("save");
    if !save_dir.exists() {
        return Ok(Vec::new());
    }

    let mut saves = Vec::new();
    for entry in fs::read_dir(&save_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let dir_name = entry.file_name().to_string_lossy().to_string();
        let save_path = entry.path();

        let display_name = read_save_name(&save_path)
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| prettify_save_dir_name(&dir_name));
        let last_modified = fs::metadata(&save_path)
            .ok()
            .and_then(|m| m.modified().ok())
            .map(|t| {
                let duration = t
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap_or_default();
                chrono::DateTime::from_timestamp(duration.as_secs() as i64, 0)
                    .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                    .unwrap_or_default()
            });

        saves.push(SaveSummary {
            name: display_name,
            directory_name: dir_name,
            path: save_path.to_string_lossy().to_string(),
            last_modified,
        });
    }

    saves.sort_by(|a, b| {
        b.last_modified
            .as_deref()
            .unwrap_or("")
            .cmp(a.last_modified.as_deref().unwrap_or(""))
    });
    Ok(saves)
}

fn prettify_save_dir_name(dir_name: &str) -> String {
    match dir_name {
        "autosave" => "Autosave".to_string(),
        "autosave_job" => "Autosave (Job)".to_string(),
        name => {
            if let Ok(n) = name.parse::<u32>() {
                format!("Save #{}", n)
            } else {
                name.replace('_', " ")
            }
        }
    }
}

fn read_save_name(save_path: &Path) -> Option<String> {
    let info_sii = save_path.join("info.sii");
    if !info_sii.exists() {
        return None;
    }
    let data = fs::read(&info_sii).ok()?;
    let text = sii::decode_sii_file(&data).ok()?;
    sii::extract_string_field(&text, "name")
}
