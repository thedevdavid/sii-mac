//! Profile cloning with granular selection and parser-based SII patching.

use std::fs;
use std::path::Path;

use crate::error::AppError;
use crate::profile::manager::encode_profile_name;
use crate::profile::metadata::read_profile_metadata;
use crate::profile::models::{CloneOptions, ModCloneStrategy, ProfileSummary};
use crate::progress::{CancelGuard, ProgressEmitter};
use crate::sii;
use crate::sii::parser::parse_siin;
use crate::sii::types::SiiValue;
use crate::sii::writer::serialize_siin;
use crate::utils;

/// Clone a profile with granular path-based options.
/// Clone a profile. If `target_profiles_dir` is provided, the clone goes there
/// (used to ensure Steam Cloud profiles are cloned to the local `profiles/` dir).
///
/// Transactional: the clone is first built in a sibling staging directory and
/// renamed into place only after every file copy succeeds. Any mid-operation
/// failure removes the staging directory, leaving the profiles list untouched.
///
/// When `progress` is `Some`, the caller receives `Started`/`Progress`/
/// terminal events over the Channel and can cancel mid-operation via the
/// `CancelGuard`. When both are `None`, the clone runs silently (current
/// behavior of non-streaming call sites).
pub fn clone_profile(
    source_path: &str,
    new_name: &str,
    target_profiles_dir: Option<&Path>,
    options: &CloneOptions,
    mut progress: Option<&mut ProgressEmitter>,
    cancel: Option<&CancelGuard<'_>>,
) -> Result<ProfileSummary, AppError> {
    let source = Path::new(source_path);
    if !source.exists() {
        return Err(AppError::NotFound(format!(
            "Source profile not found: {source_path}"
        )));
    }
    if new_name.is_empty() || new_name.len() > 64 {
        return Err(AppError::InvalidName(
            "Profile name must be 1-64 characters".into(),
        ));
    }

    let profiles_dir = if let Some(target) = target_profiles_dir {
        // Ensure the target directory exists (creates profiles/ if missing)
        fs::create_dir_all(target)?;
        target.to_path_buf()
    } else {
        source
            .parent()
            .ok_or_else(|| {
                AppError::Io(std::io::Error::other("Cannot determine profiles directory"))
            })?
            .to_path_buf()
    };

    let new_dir_name = encode_profile_name(new_name);
    let dest = profiles_dir.join(&new_dir_name);
    if dest.exists() {
        return Err(AppError::AlreadyExists(format!(
            "Profile '{new_name}' already exists"
        )));
    }

    // Total work units = 2 profile.sii patches + explicit files + explicit
    // dirs + save dirs. Used by the progress bar if streaming.
    let total_units: u64 = 2
        + options.include_files.len() as u64
        + options.include_dirs.len() as u64
        + options.include_saves.len() as u64;

    if let Some(p) = progress.as_deref_mut() {
        p.started("Preparing clone", Some(total_units));
    }

    let staging = profiles_dir.join(format!(".{new_dir_name}.clone_tmp"));
    if staging.exists() {
        fs::remove_dir_all(&staging)?;
    }

    let build_result = build_clone_into(&staging, source, new_name, options, progress, cancel);
    match build_result {
        Ok(()) => {}
        Err(e) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(e);
        }
    }

    if let Err(e) = fs::rename(&staging, &dest) {
        let _ = fs::remove_dir_all(&staging);
        return Err(e.into());
    }

    let summary = read_profile_metadata(&dest).unwrap_or_default();
    let company_name = summary.company_name;
    let save_count = utils::count_saves(&dest);
    let last_modified = utils::format_modified_time(&dest);

    Ok(ProfileSummary {
        name: new_name.to_string(),
        directory_name: new_dir_name,
        path: dest.to_string_lossy().to_string(),
        company_name,
        save_count,
        last_modified,
        is_steam_cloud: false, // Cloned profiles are always local
    })
}

fn build_clone_into(
    staging: &Path,
    source: &Path,
    new_name: &str,
    options: &CloneOptions,
    mut progress: Option<&mut ProgressEmitter>,
    cancel: Option<&CancelGuard<'_>>,
) -> Result<(), AppError> {
    fs::create_dir_all(staging)?;

    let total: u64 = 2
        + options.include_files.len() as u64
        + options.include_dirs.len() as u64
        + options.include_saves.len() as u64;
    let mut done: u64 = 0;

    macro_rules! check_cancel {
        () => {
            if let Some(c) = cancel {
                c.check()?;
            }
        };
    }

    for sii_file in &["profile.sii", "profile.bak.sii"] {
        check_cancel!();
        if let Some(p) = progress.as_deref_mut() {
            p.progress(done, Some(total), format!("Patching {sii_file}"));
        }
        let src = source.join(sii_file);
        if src.exists() {
            let patched = patch_profile_sii(&src, new_name, options)?;
            fs::write(staging.join(sii_file), patched)?;
        }
        done += 1;
    }

    // `include_files` entries come from the frontend scan which mixes real
    // files (profile.sii) with directories (academy/, album/, session/). Treat
    // directories as a recursive copy so the clone actually contains the
    // selected data instead of silently dropping it.
    for file_path in &options.include_files {
        check_cancel!();
        if let Some(p) = progress.as_deref_mut() {
            p.progress(done, Some(total), format!("Copying {file_path}"));
        }
        let src = source.join(file_path);
        let dst = staging.join(file_path);
        if src.exists() {
            if let Some(parent) = dst.parent() {
                fs::create_dir_all(parent)?;
            }
            if src.is_dir() {
                utils::copy_dir_recursive(&src, &dst)?;
            } else {
                fs::copy(&src, &dst)?;
            }
        }
        done += 1;
    }

    for dir_path in &options.include_dirs {
        check_cancel!();
        if let Some(p) = progress.as_deref_mut() {
            p.progress(done, Some(total), format!("Copying {dir_path}/"));
        }
        let src = source.join(dir_path);
        if src.exists() && src.is_dir() {
            utils::copy_dir_recursive(&src, &staging.join(dir_path))?;
        }
        done += 1;
    }

    if !options.include_saves.is_empty() {
        let save_dest = staging.join("save");
        fs::create_dir_all(&save_dest)?;
        let save_src = source.join("save");
        for save_name in &options.include_saves {
            check_cancel!();
            if let Some(p) = progress.as_deref_mut() {
                p.progress(done, Some(total), format!("Copying save {save_name}"));
            }
            let src = save_src.join(save_name);
            if src.exists() && src.is_dir() {
                utils::copy_dir_recursive(&src, &save_dest.join(save_name))?;
            }
            done += 1;
        }
    }

    Ok(())
}

/// Patch profile.sii using the parser: decode → parse → modify → serialize.
/// The serialized output is re-parsed to verify structural validity before
/// being returned, so a caller can never write a malformed profile.sii to disk.
fn patch_profile_sii(
    sii_path: &Path,
    new_name: &str,
    options: &CloneOptions,
) -> Result<Vec<u8>, AppError> {
    let data = fs::read(sii_path)?;
    let text = sii::decode_sii_file(&data)?;
    let mut doc = parse_siin(&text).map_err(AppError::SiiDecode)?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    // Find the profile object (first object in profile.sii)
    if let Some(obj) = doc.objects.first_mut() {
        obj.set("profile_name", SiiValue::String(new_name.to_string()));
        obj.set("creation_time", SiiValue::Integer(now));
        obj.set("save_time", SiiValue::Integer(now));

        // Clear online credentials unless user opted to keep them
        if !options.include_online_profile {
            obj.set("online_password", SiiValue::String(String::new()));
            obj.set("online_user_name", SiiValue::String(String::new()));
        }

        // Filter active mods according to the strategy. KeepAll leaves the
        // source profile's list untouched.
        if let ModCloneStrategy::IncludeOnly { mods } = &options.mod_strategy {
            rewrite_active_mods(obj, mods);
        }
    }

    let serialized = serialize_siin(&doc);
    parse_siin(&serialized).map_err(|e| {
        AppError::SiiDecode(format!("patched profile.sii failed verification: {e}"))
    })?;
    Ok(serialized.into_bytes())
}

/// Keep only the active_mods entries whose id is in `selected_ids`, preserving
/// the source profile's ordering.
fn rewrite_active_mods(obj: &mut crate::sii::types::SiiObject, selected_ids: &[String]) {
    let kept: Vec<SiiValue> = obj
        .fields
        .iter()
        .filter(|f| f.name.starts_with("active_mods["))
        .filter_map(|f| match &f.value {
            SiiValue::String(val) => {
                let id = val.split('|').next().unwrap_or("");
                selected_ids
                    .iter()
                    .any(|s| s == id)
                    .then(|| SiiValue::String(val.clone()))
            }
            _ => None,
        })
        .collect();
    obj.replace_indexed_array("active_mods", kept);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_patch_profile_sii_clears_credentials() {
        let sii_text = r#"SiiNunit
{
profile_save : .profile {
 profile_name: "OldName"
 creation_time: 1000
 save_time: 2000
 online_user_name: "myuser"
 online_password: "secret123"
 company_name: "My Co"
}
}"#;
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        fs::write(dir.join("profile.sii"), sii_text).unwrap();

        let options = CloneOptions::default(); // include_online_profile = false
        let result = patch_profile_sii(&dir.join("profile.sii"), "NewName", &options).unwrap();
        let output = String::from_utf8(result).unwrap();

        assert!(output.contains("profile_name: \"NewName\""));
        assert!(output.contains("online_password: \"\""));
        assert!(output.contains("online_user_name: \"\""));
        assert!(output.contains("company_name: \"My Co\""));
        assert!(!output.contains("OldName"));
        assert!(!output.contains("secret123"));
    }

    #[test]
    fn test_patch_preserves_credentials_when_opted_in() {
        let sii_text = r#"SiiNunit
{
profile_save : .profile {
 profile_name: "OldName"
 creation_time: 1000
 save_time: 2000
 online_user_name: "myuser"
 online_password: "secret123"
}
}"#;
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        fs::write(dir.join("profile.sii"), sii_text).unwrap();

        let options = CloneOptions {
            include_online_profile: true,
            ..CloneOptions::default()
        };
        let result = patch_profile_sii(&dir.join("profile.sii"), "NewName", &options).unwrap();
        let output = String::from_utf8(result).unwrap();

        assert!(output.contains("online_user_name: \"myuser\""));
        assert!(output.contains("online_password: \"secret123\""));
    }

    #[test]
    fn test_rewrite_active_mods() {
        let sii_text = r#"SiiNunit
{
profile_save : .profile {
 active_mods: 3
 active_mods[0]: "mod_a|Mod A"
 active_mods[1]: "mod_b|Mod B"
 active_mods[2]: "mod_c|Mod C"
 company_name: "Test"
}
}"#;
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        fs::write(dir.join("profile.sii"), sii_text).unwrap();

        let options = CloneOptions {
            mod_strategy: ModCloneStrategy::IncludeOnly {
                mods: vec!["mod_a".into(), "mod_c".into()],
            },
            ..CloneOptions::default()
        };
        let result = patch_profile_sii(&dir.join("profile.sii"), "Test", &options).unwrap();
        let output = String::from_utf8(result).unwrap();

        // Structural verification: re-parse the output and assert on the
        // actual indexed array instead of substring matching.
        let doc = parse_siin(&output).expect("patched profile must reparse");
        let obj = &doc.objects[0];
        assert_eq!(obj.get_int("active_mods"), Some(2));
        assert_eq!(
            obj.get_string("active_mods[0]"),
            Some("mod_a|Mod A"),
            "first surviving mod keeps position"
        );
        assert_eq!(
            obj.get_string("active_mods[1]"),
            Some("mod_c|Mod C"),
            "second surviving mod is at index 1, not 2"
        );
        // No stale mod_b entry should remain.
        assert!(
            !output.contains("mod_b|Mod B"),
            "filtered mod must not appear in serialized output"
        );
        // No stale [2] entry since the list shrunk.
        assert_eq!(obj.get("active_mods[2]"), None);
    }

    /// Write a minimal valid profile tree under `root/{hex_name}` so
    /// `clone_profile` has something to work on. Returns the hex-encoded
    /// source path.
    fn write_test_profile(root: &Path, name: &str) -> PathBuf {
        let hex = crate::profile::manager::encode_profile_name(name);
        let profile = root.join(&hex);
        fs::create_dir_all(profile.join("save")).unwrap();
        let sii = format!(
            r#"SiiNunit
{{
profile_save : .profile {{
 profile_name: "{name}"
 creation_time: 0
 save_time: 0
}}
}}"#
        );
        fs::write(profile.join("profile.sii"), &sii).unwrap();
        fs::write(profile.join("profile.bak.sii"), &sii).unwrap();
        profile
    }

    #[test]
    fn test_clone_cleans_up_staging_on_cancel() {
        let tmp = tempfile::tempdir().unwrap();
        let src = write_test_profile(tmp.path(), "Source");

        // Pre-flip a cancel flag so the first work-unit check bails.
        let registry = crate::progress::CancelRegistry::default();
        let guard = registry.register("cancel-me".to_string());
        registry.cancel("cancel-me");

        let options = CloneOptions::default();
        let result = clone_profile(
            src.to_str().unwrap(),
            "Clone",
            Some(tmp.path()),
            &options,
            None,
            Some(&guard),
        );

        assert!(
            matches!(result, Err(AppError::Cancelled)),
            "cancelled clone should return Cancelled"
        );

        let clone_hex = crate::profile::manager::encode_profile_name("Clone");
        let clone_dir = tmp.path().join(&clone_hex);
        assert!(
            !clone_dir.exists(),
            "final clone directory must not exist after cancel"
        );
        let staging = tmp.path().join(format!(".{clone_hex}.clone_tmp"));
        assert!(
            !staging.exists(),
            "staging directory must be cleaned up after cancel"
        );
    }

    #[test]
    fn test_clone_include_files_copies_directories() {
        let tmp = tempfile::tempdir().unwrap();
        let src = write_test_profile(tmp.path(), "SrcDir");
        // Create a directory entry the UI might select via the "files" list.
        fs::create_dir_all(src.join("academy")).unwrap();
        fs::write(src.join("academy/progress.dat"), b"data").unwrap();

        let options = CloneOptions {
            include_files: vec!["academy".into()],
            ..CloneOptions::default()
        };
        clone_profile(
            src.to_str().unwrap(),
            "DstDir",
            Some(tmp.path()),
            &options,
            None,
            None,
        )
        .unwrap();

        let dst_hex = crate::profile::manager::encode_profile_name("DstDir");
        let dst = tmp.path().join(dst_hex);
        assert!(
            dst.join("academy/progress.dat").exists(),
            "directory entries in include_files must be recursively copied"
        );
    }
}
