//! Profile directory content scanning for the clone UI.

use std::fs;
use std::path::Path;

use crate::error::AppError;
use crate::profile::models::{FileEntry, ModEntry, ProfileContents, SaveEntry, SaveGroup};
use crate::sii;
use crate::utils;

/// Scan a profile directory and return its full contents tree with sizes.
pub fn scan_profile_contents(profile_path: &str) -> Result<ProfileContents, AppError> {
    let root = Path::new(profile_path);
    if !root.exists() {
        return Err(AppError::NotFound(format!(
            "Profile not found: {}",
            profile_path
        )));
    }

    let mut required_files = Vec::new();
    let mut config_files = Vec::new();
    let mut progress_items = Vec::new();
    let mut total_size: u64 = 0;

    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let meta = entry.metadata()?;

        if meta.is_file() {
            let size = meta.len();
            total_size += size;
            let fe = FileEntry {
                name: name.clone(),
                path: name.clone(),
                display_name: display_name_for_file(&name),
                size,
                is_dir: false,
            };

            if name == "profile.sii" || name == "profile.bak.sii" {
                required_files.push(fe);
            } else if is_config_file(&name) {
                config_files.push(fe);
            } else {
                progress_items.push(fe);
            }
        } else if meta.is_dir() && name != "save" {
            let dir_size = utils::dir_size_recursive(&entry.path());
            total_size += dir_size;
            progress_items.push(FileEntry {
                name: name.clone(),
                path: name.clone(),
                display_name: display_name_for_dir(&name),
                size: dir_size,
                is_dir: true,
            });
        }
    }

    let save_groups = scan_save_groups(&root.join("save"))?;
    for g in &save_groups {
        total_size += g.total_size;
    }

    let active_mods = extract_mods_from_profile(root);

    Ok(ProfileContents {
        required_files,
        config_files,
        progress_items,
        save_groups,
        active_mods,
        total_size,
    })
}

fn is_config_file(name: &str) -> bool {
    matches!(name, "config.cfg" | "config_local.cfg" | "controls_osx.sii")
        || name.starts_with("gearbox_layout_")
}

fn scan_save_groups(save_dir: &Path) -> Result<Vec<SaveGroup>, AppError> {
    if !save_dir.exists() {
        return Ok(Vec::new());
    }

    let mut manual = Vec::new();
    let mut autosaves = Vec::new();
    let mut job_autosaves = Vec::new();
    let mut mp_backups = Vec::new();

    for entry in fs::read_dir(save_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let size = utils::dir_size_recursive(&entry.path());
        let has_preview = entry.path().join("preview.tga").exists();
        let display = utils::read_save_display_name(&entry.path())
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| utils::prettify_save_dir_name(&name));
        let last_modified = utils::format_modified_time(&entry.path());

        let se = SaveEntry {
            directory_name: name.clone(),
            display_name: display,
            size,
            last_modified,
            has_preview,
        };

        if name.parse::<u32>().is_ok() {
            manual.push(se);
        } else if name.starts_with("multiplayer_backup") {
            mp_backups.push(se);
        } else if name.starts_with("autosave_job") {
            job_autosaves.push(se);
        } else {
            autosaves.push(se);
        }
    }

    let mut groups = Vec::new();
    for (label, mut saves) in [
        ("Manual Saves", manual),
        ("Autosaves", autosaves),
        ("Job Autosaves", job_autosaves),
        ("Multiplayer Backups", mp_backups),
    ] {
        if !saves.is_empty() {
            saves.sort_by(|a, b| a.directory_name.cmp(&b.directory_name));
            let total_size = saves.iter().map(|s| s.size).sum();
            groups.push(SaveGroup {
                label: label.into(),
                saves,
                total_size,
            });
        }
    }
    Ok(groups)
}

fn extract_mods_from_profile(profile_path: &Path) -> Vec<ModEntry> {
    let sii_path = profile_path.join("profile.sii");
    if !sii_path.exists() {
        return Vec::new();
    }
    let data = match fs::read(&sii_path) {
        Ok(d) => d,
        Err(e) => {
            crate::warn_fallback!(
                "scanner: could not read {}: {e} — reporting profile as having no mods",
                sii_path.display()
            );
            return Vec::new();
        }
    };
    let text = match sii::decode_sii_file(&data) {
        Ok(t) => t,
        Err(e) => {
            crate::warn_fallback!(
                "scanner: could not decode {}: {e} — reporting profile as having no mods",
                sii_path.display()
            );
            return Vec::new();
        }
    };
    sii::first_object_active_mods(&text)
}

fn display_name_for_file(name: &str) -> String {
    match name {
        "config.cfg" => "Game Settings".into(),
        "config_local.cfg" => "Local Settings (Audio/Input)".into(),
        "controls_osx.sii" => "Controls & Keybindings".into(),
        "last_session_config.sii" => "Session Config".into(),
        "tutorial_hint_data.sii" => "Tutorial Hints".into(),
        "profile.sii" => "Profile Data".into(),
        "profile.bak.sii" => "Profile Backup".into(),
        n if n.starts_with("gearbox_layout_") => {
            let inner = n
                .strip_prefix("gearbox_layout_")
                .and_then(|s| s.strip_suffix(".sii"))
                .unwrap_or(n);
            format!("Gearbox: {}", inner.replace('_', " "))
        }
        n => n.to_string(),
    }
}

fn display_name_for_dir(name: &str) -> String {
    match name {
        "academy" => "Academy Progress".into(),
        "album" => "Landmarks Album".into(),
        "screenshots" => "Screenshots".into(),
        n => n.to_string(),
    }
}
