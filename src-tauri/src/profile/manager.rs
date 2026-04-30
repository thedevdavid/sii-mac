//! High-level profile management: list, detail, rename, delete.
//! Cloning is in `cloner.rs`, scanning in `scanner.rs`, metadata in `metadata.rs`.

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::profile::metadata::{
    extract_all_profile_fields, read_decoded_profile_text, read_profile_metadata,
    ProfileSummaryFields,
};
use crate::profile::models::{ProfileDetail, ProfileSummary, SaveSummary};
use crate::utils;
use crate::warn_fallback;

/// Encode a profile name to its hex directory name.
pub fn encode_profile_name(name: &str) -> String {
    name.bytes()
        .map(|b| format!("{:02X}", b))
        .collect::<String>()
}

/// Decode a hex directory name back to a profile name.
pub fn decode_profile_name(hex_name: &str) -> Option<String> {
    if hex_name.is_empty() || !hex_name.len().is_multiple_of(2) {
        return None;
    }
    let bytes: Result<Vec<u8>, _> = (0..hex_name.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex_name[i..i + 2], 16))
        .collect();
    bytes.ok().and_then(|b| String::from_utf8(b).ok())
}

/// List all profiles for a game installation.
/// Scans both `profiles/` (local) and `steam_profiles/` (Steam Cloud).
/// For Steam Cloud profiles, resolves the actual data path from Steam userdata.
pub fn list_profiles(profiles_path: &str) -> Result<Vec<ProfileSummary>, AppError> {
    let profiles_dir = Path::new(profiles_path);
    let base_dir = profiles_dir
        .parent()
        .ok_or_else(|| AppError::NotFound("Invalid profiles path".into()))?;

    let mut profiles = Vec::new();
    let mut seen_dirs = std::collections::HashSet::new();

    let local_dir = base_dir.join("profiles");
    if local_dir.exists() {
        scan_profile_dir_with(&local_dir, &mut profiles, &mut seen_dirs, ScanKind::Local)?;
    }

    let steam_dir = base_dir.join("steam_profiles");
    if steam_dir.exists() {
        // Resolve once for all entries in this scan. The resolver points at
        // `{Steam}/userdata/{uid}/{app_id}/remote/profiles` when available and
        // falls back to the stub `steam_profiles/` directory otherwise (with a
        // warning, because the stub doesn't sync to Steam Cloud).
        let steam_remote = find_steam_remote_profiles(base_dir);
        scan_profile_dir_with(
            &steam_dir,
            &mut profiles,
            &mut seen_dirs,
            ScanKind::SteamCloud {
                remote: steam_remote.as_deref(),
            },
        )?;
    }

    if profiles.is_empty() && !local_dir.exists() && !steam_dir.exists() {
        return Err(AppError::NotFound(format!(
            "No profiles or steam_profiles directory found in {}",
            base_dir.display()
        )));
    }

    profiles.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(profiles)
}

/// Describes how a single profile directory entry should be resolved into a
/// `ProfileSummary`. Local entries keep their on-disk path; Steam Cloud
/// entries prefer the Steam userdata remote path when reachable and warn on
/// the dead-end stub fallback.
enum ScanKind<'a> {
    Local,
    SteamCloud { remote: Option<&'a Path> },
}

fn scan_profile_dir_with(
    dir: &Path,
    profiles: &mut Vec<ProfileSummary>,
    seen: &mut std::collections::HashSet<String>,
    kind: ScanKind<'_>,
) -> Result<(), AppError> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let dir_name = entry.file_name().to_string_lossy().to_string();
        if !entry.file_type()?.is_dir() || dir_name.starts_with('.') {
            continue;
        }
        if !seen.insert(dir_name.clone()) {
            continue;
        }

        let profile_name = decode_profile_name(&dir_name).unwrap_or_else(|| dir_name.clone());
        let entry_path = entry.path();
        let (data_path, is_steam_cloud) = match &kind {
            ScanKind::Local => (entry_path.clone(), false),
            ScanKind::SteamCloud { remote } => {
                let resolved = remote
                    .map(|r| r.join(&dir_name))
                    .filter(|p| p.exists())
                    .unwrap_or_else(|| {
                        warn_fallback!(
                            "Steam Cloud profile `{}` has no reachable Steam userdata \
                             remote; falling back to stub directory `{}` — edits will \
                             not sync to the cloud",
                            dir_name,
                            entry_path.display()
                        );
                        entry_path.clone()
                    });
                (resolved, true)
            }
        };

        let summary = read_profile_metadata(&data_path).unwrap_or_else(|e| {
            warn_fallback!(
                "failed to read metadata for profile `{}` at {}: {} — \
                 displaying without company/money/XP",
                dir_name,
                data_path.display(),
                e
            );
            ProfileSummaryFields::default()
        });
        let save_count = utils::count_saves(&data_path);
        let last_modified = utils::format_modified_time(&data_path);

        profiles.push(ProfileSummary {
            name: profile_name,
            directory_name: dir_name,
            path: data_path.to_string_lossy().to_string(),
            company_name: summary.company_name,
            save_count,
            last_modified,
            is_steam_cloud,
        });
    }
    Ok(())
}

/// Find the Steam userdata remote profiles path for this game installation.
/// Uses [`crate::steam`] for cross-platform Steam root enumeration, then
/// walks each `userdata/{uid}/{app_id}/remote/profiles` candidate.
///
/// When multiple user IDs exist under a Steam install (someone shared a PC,
/// or switched accounts), directory iteration order is filesystem-defined
/// and inconsistent between OSes. Sorting by the numeric user id makes the
/// selected profile deterministic: the lowest uid wins, which matches
/// Steam's own "last logged-in user first" convention for most users.
fn find_steam_remote_profiles(game_base: &Path) -> Option<PathBuf> {
    let app_id = crate::steam::app_id_from_game_base(game_base);

    for userdata_root in crate::steam::steam_userdata_roots_for_game(game_base) {
        if !userdata_root.exists() {
            continue;
        }
        let entries = match fs::read_dir(&userdata_root) {
            Ok(e) => e,
            Err(e) => {
                warn_fallback!(
                    "could not enumerate Steam userdata at {}: {e}",
                    userdata_root.display()
                );
                continue;
            }
        };
        let mut uids: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
        uids.sort_by_key(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(u64::MAX)
        });
        for uid_dir in uids {
            let remote = uid_dir.join(app_id).join("remote").join("profiles");
            if remote.is_dir() {
                return Some(remote);
            }
        }
    }

    None
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
    let last_modified = utils::format_modified_time(path);
    let decoded_text = read_decoded_profile_text(path).ok();
    let fields = decoded_text
        .as_ref()
        .map(|text| extract_all_profile_fields(text))
        .unwrap_or_default();

    Ok(ProfileDetail {
        name: profile_name,
        directory_name: dir_name,
        path: profile_path.to_string(),
        company_name: fields.company_name,
        experience_points: fields.experience_points,
        money: fields.money,
        save_count,
        saves,
        last_modified,
        raw_profile_text: decoded_text,
        face: fields.face,
        brand: fields.brand,
        logo: fields.logo,
        male: fields.male,
        map_path: fields.map_path,
        cached_experience: fields.cached_experience,
        cached_distance: fields.cached_distance,
        cached_stats: fields.cached_stats,
        online_user_name: fields.online_user_name,
        creation_time: fields.creation_time,
        save_time: fields.save_time,
        version: fields.version,
        customization: fields.customization,
        active_mods: fields.active_mods,
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
            "Profile name must be 1-64 characters".into(),
        ));
    }

    let profiles_dir = source.parent().ok_or_else(|| {
        AppError::Io(std::io::Error::other("Cannot determine profiles directory"))
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

    let summary = read_profile_metadata(&dest).unwrap_or_default();
    let save_count = utils::count_saves(&dest);
    let last_modified = utils::format_modified_time(&dest);

    Ok(ProfileSummary {
        name: new_name.to_string(),
        directory_name: new_dir_name,
        path: dest.to_string_lossy().to_string(),
        company_name: summary.company_name,
        save_count,
        last_modified,
        is_steam_cloud: false,
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

    // Reject symlinks outright: a symlinked profile directory could point at an
    // arbitrary location, and following it would delete files outside the
    // profiles tree. Real profile directories are plain directories.
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() {
        return Err(AppError::InvalidPath(
            "Refusing to delete a symlinked profile entry".into(),
        ));
    }
    if !metadata.is_dir() {
        return Err(AppError::InvalidPath(format!(
            "Not a directory: {profile_path}"
        )));
    }

    // Canonicalize, then verify the path is contained within a known profiles
    // directory (either local `profiles/` or Steam Cloud `steam_profiles/`) and
    // that the leaf name is a valid hex-encoded profile name. This prevents a
    // bug or malicious caller from passing an arbitrary path.
    let canonical = path.canonicalize()?;
    let parent = canonical.parent().ok_or_else(|| {
        AppError::InvalidPath(format!("profile path has no parent: {profile_path}"))
    })?;
    let parent_name = parent
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();
    if parent_name != "profiles" && parent_name != "steam_profiles" {
        return Err(AppError::InvalidPath(format!(
            "refusing to delete {profile_path}: not inside a profiles directory"
        )));
    }
    let leaf_name = canonical
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();
    if decode_profile_name(leaf_name).is_none() {
        return Err(AppError::InvalidPath(format!(
            "refusing to delete {profile_path}: not a valid encoded profile name"
        )));
    }

    fs::remove_dir_all(&canonical)?;
    Ok(())
}

pub fn list_saves_in_profile(
    profile_path: impl AsRef<std::path::Path>,
) -> Result<Vec<SaveSummary>, AppError> {
    let profile_path = profile_path.as_ref();
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
        let display_name = utils::read_save_display_name(&save_path)
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| utils::prettify_save_dir_name(&dir_name));
        let last_modified = utils::format_modified_time(&save_path);

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
        assert_eq!(decode_profile_name("ZZZ"), None);
        assert_eq!(decode_profile_name("ZZZZ"), None);
    }

    #[test]
    fn test_decode_empty() {
        assert_eq!(decode_profile_name(""), None);
    }

    #[test]
    fn test_delete_profile_rejects_nonexistent() {
        let tmp = tempfile::tempdir().unwrap();
        let missing = tmp.path().join("does_not_exist");
        let result = delete_profile(missing.to_str().unwrap());
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn test_delete_profile_rejects_path_outside_profiles_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("not_profiles").join("54657374");
        fs::create_dir_all(&target).unwrap();

        let result = delete_profile(target.to_str().unwrap());
        match result {
            Err(AppError::InvalidPath(msg)) => {
                assert!(
                    msg.contains("not inside a profiles directory"),
                    "got: {msg}"
                );
            }
            other => panic!("expected InvalidPath, got {other:?}"),
        }
        assert!(target.exists(), "target must not be deleted");
    }

    #[test]
    fn test_delete_profile_rejects_invalid_leaf_name() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("profiles").join("not-hex-name");
        fs::create_dir_all(&target).unwrap();

        let result = delete_profile(target.to_str().unwrap());
        match result {
            Err(AppError::InvalidPath(msg)) => {
                assert!(
                    msg.contains("not a valid encoded profile name"),
                    "got: {msg}"
                );
            }
            other => panic!("expected InvalidPath, got {other:?}"),
        }
        assert!(target.exists(), "target must not be deleted");
    }

    #[test]
    fn test_delete_profile_accepts_valid_path() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("profiles").join("54657374");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("profile.sii"), b"").unwrap();

        delete_profile(target.to_str().unwrap()).expect("valid profile must delete");
        assert!(!target.exists(), "target must be deleted");
    }

    #[test]
    fn test_delete_profile_accepts_steam_profiles_parent() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("steam_profiles").join("54657374");
        fs::create_dir_all(&target).unwrap();

        delete_profile(target.to_str().unwrap()).expect("steam profile must delete");
        assert!(!target.exists());
    }

    #[test]
    fn test_delete_profile_rejects_symlink_to_outside_directory() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let tmp = tempfile::tempdir().unwrap();
            let real = tmp.path().join("elsewhere");
            fs::create_dir_all(&real).unwrap();
            let link_parent = tmp.path().join("profiles");
            fs::create_dir_all(&link_parent).unwrap();
            let link = link_parent.join("54657374");
            symlink(&real, &link).unwrap();

            let result = delete_profile(link.to_str().unwrap());
            match result {
                Err(AppError::InvalidPath(msg)) => {
                    assert!(msg.contains("symlink"), "got: {msg}");
                }
                other => panic!("expected InvalidPath(symlink), got {other:?}"),
            }
            assert!(
                real.exists(),
                "real target must not be deleted through symlink"
            );
        }
    }
}
