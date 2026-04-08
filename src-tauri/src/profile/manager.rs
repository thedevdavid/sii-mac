use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use crate::error::AppError;
use crate::profile::models::{
    FileEntry, ModEntry, ProfileContents, ProfileDetail, ProfileSummary,
    SaveEntry, SaveGroup, SaveSummary,
};
use crate::sii;

/// Encode a profile name to its hex directory name.
pub fn encode_profile_name(name: &str) -> String {
    name.bytes()
        .map(|b| format!("{:02X}", b))
        .collect::<String>()
}

/// Decode a hex directory name back to a profile name.
pub fn decode_profile_name(hex_name: &str) -> Option<String> {
    if hex_name.len() % 2 != 0 {
        return None;
    }
    let bytes: Result<Vec<u8>, _> = (0..hex_name.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex_name[i..i + 2], 16))
        .collect();
    bytes.ok().and_then(|b| String::from_utf8(b).ok())
}

pub fn list_profiles(profiles_path: &str) -> Result<Vec<ProfileSummary>, AppError> {
    let profiles_dir = Path::new(profiles_path);
    if !profiles_dir.exists() {
        return Err(AppError::NotFound(format!(
            "Profiles directory not found: {}",
            profiles_path
        )));
    }

    let mut profiles = Vec::new();

    for entry in fs::read_dir(profiles_dir)? {
        let entry = entry?;
        let dir_name = entry.file_name().to_string_lossy().to_string();

        if !entry.file_type()?.is_dir() || dir_name.starts_with('.') {
            continue;
        }

        let profile_name = decode_profile_name(&dir_name).unwrap_or_else(|| dir_name.clone());
        let profile_path = entry.path();

        let (company_name, _, _) =
            read_profile_metadata(&profile_path).unwrap_or((None, None, None));

        let save_count = count_saves(&profile_path);
        let last_modified = format_modified_time(&profile_path);

        profiles.push(ProfileSummary {
            name: profile_name,
            directory_name: dir_name,
            path: profile_path.to_string_lossy().to_string(),
            company_name,
            save_count,
            last_modified,
        });
    }

    profiles.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(profiles)
}

pub fn get_profile_detail(profile_path: &str) -> Result<ProfileDetail, AppError> {
    let path = Path::new(profile_path);
    if !path.exists() {
        return Err(AppError::NotFound(format!(
            "Profile not found: {}",
            profile_path
        )));
    }

    let dir_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let profile_name = decode_profile_name(&dir_name).unwrap_or_else(|| dir_name.clone());

    let saves = list_saves_in_profile(path)?;
    let save_count = saves.len();
    let last_modified = format_modified_time(path);

    // Decode profile.sii once and extract all fields
    let decoded_text = read_decoded_profile_text(path).ok();

    let (
        company_name,
        experience_points,
        money,
        face,
        brand,
        logo,
        male,
        map_path,
        cached_experience,
        cached_distance,
        cached_stats,
        online_user_name,
        creation_time,
        save_time,
        version,
        customization,
        active_mods,
    ) = if let Some(ref text) = decoded_text {
        let company_name = sii::extract_string_field(text, "company_name");
        let experience_points = sii::extract_u64_field(text, "experience_points");
        let money = sii::extract_u64_field(text, "money_account");
        let face = sii::extract_u32_field(text, "face");
        let brand = sii::extract_string_field(text, "brand");
        let logo = sii::extract_string_field(text, "logo");
        let male = sii::extract_bool_field(text, "male");
        let map_path = sii::extract_string_field(text, "map_path");
        let cached_experience = sii::extract_u64_field(text, "cached_experience");
        let cached_distance = sii::extract_f64_field(text, "cached_distance");
        let stats = sii::extract_indexed_array_u64(text, "cached_stats", 20);
        let cached_stats = if stats.iter().any(|&v| v > 0) { Some(stats) } else { None };
        let online_user_name = sii::extract_string_field(text, "online_user_name")
            .filter(|s| !s.is_empty());
        let creation_time = sii::extract_u64_field(text, "creation_time");
        let save_time = sii::extract_u64_field(text, "save_time");
        let version = sii::extract_u32_field(text, "version");
        let customization = sii::extract_u32_field(text, "customization");
        let mods: Vec<ModEntry> = sii::extract_active_mods(text)
            .into_iter()
            .map(|(id, display_name)| ModEntry { id, display_name })
            .collect();

        (
            company_name,
            experience_points,
            money,
            face,
            brand,
            logo,
            male,
            map_path,
            cached_experience,
            cached_distance,
            cached_stats,
            online_user_name,
            creation_time,
            save_time,
            version,
            customization,
            mods,
        )
    } else {
        (None, None, None, None, None, None, None, None, None, None, None, None, None, None, None, None, Vec::new())
    };

    Ok(ProfileDetail {
        name: profile_name,
        directory_name: dir_name,
        path: profile_path.to_string(),
        company_name,
        experience_points,
        money,
        save_count,
        saves,
        last_modified,
        raw_profile_text: decoded_text,
        face,
        brand,
        logo,
        male,
        map_path,
        cached_experience,
        cached_distance,
        cached_stats,
        online_user_name,
        creation_time,
        save_time,
        version,
        customization,
        active_mods,
    })
}

/// Scan a profile directory and return its full contents tree with sizes.
pub fn scan_profile_contents(profile_path: &str) -> Result<ProfileContents, AppError> {
    let root = Path::new(profile_path);
    if !root.exists() {
        return Err(AppError::NotFound(format!("Profile not found: {}", profile_path)));
    }

    let mut required_files = Vec::new();
    let mut config_files = Vec::new();
    let mut progress_items = Vec::new();
    let mut total_size: u64 = 0;

    // Classify root-level files
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
            } else if name == "config.cfg"
                || name == "config_local.cfg"
                || name == "controls_osx.sii"
                || name.starts_with("gearbox_layout_")
            {
                config_files.push(fe);
            } else {
                // tutorial_hint_data.sii, last_session_config.sii, etc.
                progress_items.push(fe);
            }
        } else if meta.is_dir() && name != "save" {
            let dir_size = dir_size_recursive(&entry.path());
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

    // Scan saves and group them
    let save_groups = scan_save_groups(&root.join("save"))?;
    for g in &save_groups {
        total_size += g.total_size;
    }

    // Extract active mods from profile.sii
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
        let size = dir_size_recursive(&entry.path());
        let has_preview = entry.path().join("preview.tga").exists();
        let display = read_save_display_name(&entry.path())
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| prettify_save_dir_name(&name));
        let last_modified = format_modified_time(&entry.path());

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
            // autosave, autosave_drive, autosave_drive_N
            autosaves.push(se);
        }
    }

    let mut groups = Vec::new();
    if !manual.is_empty() {
        manual.sort_by(|a, b| a.directory_name.cmp(&b.directory_name));
        let total = manual.iter().map(|s| s.size).sum();
        groups.push(SaveGroup { label: "Manual Saves".into(), saves: manual, total_size: total });
    }
    if !autosaves.is_empty() {
        autosaves.sort_by(|a, b| a.directory_name.cmp(&b.directory_name));
        let total = autosaves.iter().map(|s| s.size).sum();
        groups.push(SaveGroup { label: "Autosaves".into(), saves: autosaves, total_size: total });
    }
    if !job_autosaves.is_empty() {
        job_autosaves.sort_by(|a, b| a.directory_name.cmp(&b.directory_name));
        let total = job_autosaves.iter().map(|s| s.size).sum();
        groups.push(SaveGroup { label: "Job Autosaves".into(), saves: job_autosaves, total_size: total });
    }
    if !mp_backups.is_empty() {
        mp_backups.sort_by(|a, b| a.directory_name.cmp(&b.directory_name));
        let total = mp_backups.iter().map(|s| s.size).sum();
        groups.push(SaveGroup { label: "Multiplayer Backups".into(), saves: mp_backups, total_size: total });
    }
    Ok(groups)
}

fn extract_mods_from_profile(profile_path: &Path) -> Vec<ModEntry> {
    let sii_path = profile_path.join("profile.sii");
    if !sii_path.exists() {
        return Vec::new();
    }
    let Ok(data) = fs::read(&sii_path) else { return Vec::new() };
    let Ok(text) = sii::decode_sii_file(&data) else { return Vec::new() };
    sii::extract_active_mods(&text)
        .into_iter()
        .map(|(id, display_name)| ModEntry { id, display_name })
        .collect()
}

/// Decode a profile.sii, patch fields based on clone options, return as plaintext SiiNunit.
/// The game accepts plaintext SiiNunit format, so no re-encryption is needed.
fn patch_profile_sii(
    sii_path: &Path,
    new_name: &str,
    options: &crate::profile::models::CloneOptions,
) -> Result<Vec<u8>, AppError> {
    let data = fs::read(sii_path)?;
    let text = sii::decode_sii_file(&data)?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Build filtered mod list if mod filtering is enabled
    let filtered_mods: Option<Vec<&str>> = if options.filter_mods {
        // Collect the original active_mods lines that match selected mod IDs
        let mut mods = Vec::new();
        for line in text.lines() {
            let trimmed = line.trim();
            if !trimmed.starts_with("active_mods[") {
                continue;
            }
            if let Some((_key, value)) = trimmed.split_once(':') {
                let val = value.trim().trim_matches('"');
                if let Some((id, _name)) = val.split_once('|') {
                    if options.include_mods.iter().any(|m| m == id) {
                        mods.push(val);
                    }
                }
            }
        }
        Some(mods)
    } else {
        None
    };

    let mut patched_lines: Vec<String> = Vec::new();
    let mut skip_active_mods_entries = false;

    for line in text.lines() {
        let trimmed = line.trim();

        // Replace profile_name
        if trimmed.starts_with("profile_name:") {
            patched_lines.push(format!(" profile_name: {}", new_name));
            continue;
        }

        // Update creation_time to now
        if trimmed.starts_with("creation_time:") {
            patched_lines.push(format!(" creation_time: {}", now));
            continue;
        }

        // Update save_time to now
        if trimmed.starts_with("save_time:") {
            patched_lines.push(format!(" save_time: {}", now));
            continue;
        }

        // Clear online credentials unless user opted to keep them
        if !options.include_online_profile {
            if trimmed.starts_with("online_password:") {
                patched_lines.push(" online_password: \"\"".to_string());
                continue;
            }
            if trimmed.starts_with("online_user_name:") {
                patched_lines.push(" online_user_name: \"\"".to_string());
                continue;
            }
        }

        // Handle active_mods array rewrite
        if let Some(ref mods) = filtered_mods {
            // Replace the array count line
            if trimmed.starts_with("active_mods:") && !trimmed.starts_with("active_mods[") {
                patched_lines.push(format!(" active_mods: {}", mods.len()));
                // Write the new array entries
                for (i, mod_val) in mods.iter().enumerate() {
                    patched_lines.push(format!(" active_mods[{}]: \"{}\"", i, mod_val));
                }
                skip_active_mods_entries = true;
                continue;
            }

            // Skip original active_mods[N] entries (we already wrote new ones)
            if trimmed.starts_with("active_mods[") {
                continue;
            }

            // Stop skipping once we hit a non-active_mods line after the array
            if skip_active_mods_entries && !trimmed.starts_with("active_mods") {
                skip_active_mods_entries = false;
            }
        }

        patched_lines.push(line.to_string());
    }

    Ok(patched_lines.join("\n").into_bytes())
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
            let inner = n.strip_prefix("gearbox_layout_").unwrap_or(n);
            let inner = inner.strip_suffix(".sii").unwrap_or(inner);
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

fn dir_size_recursive(path: &Path) -> u64 {
    let mut total: u64 = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total += meta.len();
                } else if meta.is_dir() {
                    total += dir_size_recursive(&entry.path());
                }
            }
        }
    }
    total
}

/// Clone a profile with granular path-based options.
pub fn clone_profile(
    source_path: &str,
    new_name: &str,
    options: &crate::profile::models::CloneOptions,
) -> Result<ProfileSummary, AppError> {
    let source = Path::new(source_path);
    if !source.exists() {
        return Err(AppError::NotFound(format!("Source profile not found: {}", source_path)));
    }
    if new_name.is_empty() || new_name.len() > 64 {
        return Err(AppError::InvalidName("Profile name must be 1-64 characters".into()));
    }

    let profiles_dir = source.parent().ok_or_else(|| {
        AppError::Io(std::io::Error::other("Cannot determine profiles directory"))
    })?;

    let new_dir_name = encode_profile_name(new_name);
    let dest = profiles_dir.join(&new_dir_name);
    if dest.exists() {
        return Err(AppError::AlreadyExists(format!("Profile '{}' already exists", new_name)));
    }

    fs::create_dir_all(&dest)?;

    // Copy and patch profile.sii — update profile_name, mods, timestamps
    for sii_file in &["profile.sii", "profile.bak.sii"] {
        let src = source.join(sii_file);
        if src.exists() {
            let patched = patch_profile_sii(&src, new_name, options)?;
            fs::write(dest.join(sii_file), patched)?;
        }
    }

    // Copy selected files
    for file_path in &options.include_files {
        let src = source.join(file_path);
        if src.exists() && src.is_file() {
            fs::copy(&src, dest.join(file_path))?;
        }
    }

    // Copy selected directories (non-save)
    for dir_path in &options.include_dirs {
        let src = source.join(dir_path);
        if src.exists() && src.is_dir() {
            copy_dir_recursive(&src, &dest.join(dir_path))?;
        }
    }

    // Copy selected saves
    if !options.include_saves.is_empty() {
        let save_dest = dest.join("save");
        fs::create_dir_all(&save_dest)?;
        let save_src = source.join("save");
        for save_name in &options.include_saves {
            let src = save_src.join(save_name);
            if src.exists() && src.is_dir() {
                copy_dir_recursive(&src, &save_dest.join(save_name))?;
            }
        }
    }

    let (company_name, _, _) = read_profile_metadata(&dest).unwrap_or((None, None, None));
    let save_count = count_saves(&dest);
    let last_modified = format_modified_time(&dest);

    Ok(ProfileSummary {
        name: new_name.to_string(),
        directory_name: new_dir_name,
        path: dest.to_string_lossy().to_string(),
        company_name,
        save_count,
        last_modified,
    })
}

pub fn rename_profile(profile_path: &str, new_name: &str) -> Result<ProfileSummary, AppError> {
    let source = Path::new(profile_path);
    if !source.exists() {
        return Err(AppError::NotFound(format!(
            "Profile not found: {}",
            profile_path
        )));
    }

    if new_name.is_empty() || new_name.len() > 64 {
        return Err(AppError::InvalidName(
            "Profile name must be 1-64 characters".to_string(),
        ));
    }

    let profiles_dir = source.parent().ok_or_else(|| {
        AppError::Io(std::io::Error::other(
            "Cannot determine profiles directory",
        ))
    })?;

    let new_dir_name = encode_profile_name(new_name);
    let dest = profiles_dir.join(&new_dir_name);

    if dest.exists() {
        return Err(AppError::AlreadyExists(format!(
            "Profile '{}' already exists",
            new_name
        )));
    }

    fs::rename(source, &dest)?;

    let (company_name, _, _) = read_profile_metadata(&dest).unwrap_or((None, None, None));
    let save_count = count_saves(&dest);
    let last_modified = format_modified_time(&dest);

    Ok(ProfileSummary {
        name: new_name.to_string(),
        directory_name: new_dir_name,
        path: dest.to_string_lossy().to_string(),
        company_name,
        save_count,
        last_modified,
    })
}

pub fn delete_profile(profile_path: &str) -> Result<(), AppError> {
    let path = Path::new(profile_path);
    if !path.exists() {
        return Err(AppError::NotFound(format!(
            "Profile not found: {}",
            profile_path
        )));
    }
    fs::remove_dir_all(path)?;
    Ok(())
}

fn list_saves_in_profile(profile_path: &Path) -> Result<Vec<SaveSummary>, AppError> {
    let save_dir = profile_path.join("save");
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

        let display_name = read_save_display_name(&save_path)
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| prettify_save_dir_name(&dir_name));
        let last_modified = format_modified_time(&save_path);

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

fn count_saves(profile_path: &Path) -> usize {
    let save_dir = profile_path.join("save");
    if !save_dir.exists() {
        return 0;
    }
    fs::read_dir(&save_dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                .count()
        })
        .unwrap_or(0)
}

fn read_profile_metadata(
    profile_path: &Path,
) -> Result<(Option<String>, Option<u64>, Option<u64>), AppError> {
    let sii_path = find_profile_sii(profile_path);
    let Some(sii_path) = sii_path else {
        return Ok((None, None, None));
    };

    let data = fs::read(&sii_path)?;
    let text = sii::decode_sii_file(&data)?;

    let company_name = sii::extract_string_field(&text, "company_name");
    let experience = sii::extract_u64_field(&text, "experience_points");
    let money = sii::extract_u64_field(&text, "money_account");

    Ok((company_name, experience, money))
}

fn read_decoded_profile_text(profile_path: &Path) -> Result<String, AppError> {
    let sii_path = find_profile_sii(profile_path)
        .ok_or_else(|| AppError::NotFound("No profile.sii found".to_string()))?;
    let data = fs::read(&sii_path)?;
    sii::decode_sii_file(&data)
}

fn find_profile_sii(profile_path: &Path) -> Option<PathBuf> {
    let direct = profile_path.join("profile.sii");
    if direct.exists() {
        return Some(direct);
    }

    let save_dir = profile_path.join("save");
    if save_dir.exists() {
        for name in &["autosave", "autosave_job", "1", "2", "3"] {
            let sii = save_dir.join(name).join("game.sii");
            if sii.exists() {
                return Some(sii);
            }
        }
    }

    None
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

fn read_save_display_name(save_path: &Path) -> Option<String> {
    let info_sii = save_path.join("info.sii");
    if !info_sii.exists() {
        return None;
    }
    let data = fs::read(&info_sii).ok()?;
    let text = sii::decode_sii_file(&data).ok()?;
    sii::extract_string_field(&text, "name")
}

fn format_modified_time(path: &Path) -> Option<String> {
    fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| {
            let duration = t
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default();
            chrono::DateTime::from_timestamp(duration.as_secs() as i64, 0)
                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                .unwrap_or_default()
        })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_profile_name() {
        assert_eq!(encode_profile_name("Test"), "54657374");
        assert_eq!(encode_profile_name("MyProfile"), "4D7950726F66696C65");
    }

    #[test]
    fn test_decode_profile_name() {
        assert_eq!(decode_profile_name("54657374"), Some("Test".to_string()));
        assert_eq!(
            decode_profile_name("4D7950726F66696C65"),
            Some("MyProfile".to_string())
        );
    }

    #[test]
    fn test_roundtrip_profile_name() {
        let name = "JustStressedOut";
        let encoded = encode_profile_name(name);
        let decoded = decode_profile_name(&encoded);
        assert_eq!(decoded, Some(name.to_string()));
    }

    #[test]
    fn test_decode_invalid_hex() {
        assert_eq!(decode_profile_name("ZZZ"), None); // odd length
        assert_eq!(decode_profile_name("ZZZZ"), None); // invalid hex
    }
}
