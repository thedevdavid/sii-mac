use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use crate::error::AppError;
use crate::profile::models::{ProfileDetail, ProfileSummary, SaveSummary};
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

    let (company_name, experience_points, money) =
        read_profile_metadata(path).unwrap_or((None, None, None));

    let saves = list_saves_in_profile(path)?;
    let save_count = saves.len();
    let last_modified = format_modified_time(path);
    let raw_profile_text = read_decoded_profile_text(path).ok();

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
        raw_profile_text,
    })
}

pub fn clone_profile(
    source_path: &str,
    new_name: &str,
    options: &crate::profile::models::CloneOptions,
) -> Result<ProfileSummary, AppError> {
    let source = Path::new(source_path);
    if !source.exists() {
        return Err(AppError::NotFound(format!(
            "Source profile not found: {}",
            source_path
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

    // Selective copy based on options
    fs::create_dir_all(&dest)?;

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        let src_path = entry.path();
        let dst_path = dest.join(&name);

        if entry.file_type()?.is_dir() {
            if name == "save" {
                if options.include_saves {
                    if options.selected_saves.is_empty() {
                        // Copy all saves
                        copy_dir_recursive(&src_path, &dst_path)?;
                    } else {
                        // Copy only selected saves
                        fs::create_dir_all(&dst_path)?;
                        for save_entry in fs::read_dir(&src_path)? {
                            let save_entry = save_entry?;
                            let save_name =
                                save_entry.file_name().to_string_lossy().to_string();
                            if options.selected_saves.contains(&save_name) {
                                copy_dir_recursive(
                                    &save_entry.path(),
                                    &dst_path.join(&save_name),
                                )?;
                            }
                        }
                    }
                }
            } else if name == "screenshots" {
                if options.include_screenshots {
                    copy_dir_recursive(&src_path, &dst_path)?;
                }
            } else {
                // Always copy other directories (e.g. mod data)
                copy_dir_recursive(&src_path, &dst_path)?;
            }
        } else {
            // Files in profile root
            if name == "config.cfg" && !options.include_config {
                continue;
            }
            fs::copy(&src_path, &dst_path)?;
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
