//! Write operations for mods: replace the active_mods list in profile.sii
//! and delete local mod files from the game's `mod/` directory.
//!
//! Individual enable/disable is no longer exposed — the mod manager works in
//! terms of playsets that are applied atomically via `set_active_mods`.

use std::fs;
use std::path::Path;

use crate::error::AppError;
use crate::profile::metadata::find_profile_sii;
use crate::profile::models::ModEntry;
use crate::sii;
use crate::sii::parser::parse_siin;
use crate::sii::types::{SiiObject, SiiValue};
use crate::sii::writer::serialize_siin;
use crate::utils::atomic_replace_verified;

/// Replace the entire `active_mods` list in profile.sii with `entries`, in the
/// order given. Used by the playset manager's `apply_playset` flow — writing
/// a playset is always a full replacement, never a partial edit.
pub fn set_active_mods(profile_path: &str, entries: &[ModEntry]) -> Result<(), AppError> {
    mutate_active_mods(profile_path, |mods| {
        mods.clear();
        mods.extend_from_slice(entries);
    })
}

/// Delete a local mod from `{base_path}/mod/`. Accepts either a bare mod id
/// (file stem) or a full filename. Workshop mods live under Steam's directories
/// and are explicitly not handled here — they must be unsubscribed via Steam.
pub fn delete_local_mod(base_path: &str, mod_id: &str) -> Result<(), AppError> {
    if mod_id.starts_with("mod_workshop_package.") {
        return Err(AppError::InvalidPath(
            "Workshop mods cannot be deleted from the filesystem — unsubscribe in Steam instead"
                .into(),
        ));
    }

    let mod_dir = Path::new(base_path).join("mod");
    if !mod_dir.exists() {
        return Err(AppError::NotFound(format!(
            "Mod directory not found: {}",
            mod_dir.display()
        )));
    }

    // Try the exact name first, then the .scs variant, then a directory.
    let candidates = [
        mod_dir.join(mod_id),
        mod_dir.join(format!("{}.scs", mod_id)),
    ];

    for candidate in &candidates {
        if !candidate.exists() {
            continue;
        }
        // Safety: candidate must stay inside mod_dir (no traversal via symlinks
        // or crafted ids).
        let canonical_target = candidate.canonicalize()?;
        let canonical_root = mod_dir.canonicalize()?;
        if !canonical_target.starts_with(&canonical_root) {
            return Err(AppError::InvalidPath(
                "Refusing to delete path outside mod directory".into(),
            ));
        }

        if candidate.is_dir() {
            fs::remove_dir_all(candidate)?;
        } else {
            fs::remove_file(candidate)?;
        }
        return Ok(());
    }

    Err(AppError::NotFound(format!(
        "Local mod '{}' not found in {}",
        mod_id,
        mod_dir.display()
    )))
}

// --- Internal helpers ---

/// Read profile.sii, apply `f` to the decoded active_mods list, and write it
/// back as plaintext SiiNunit. The game accepts both plaintext and encoded
/// profile.sii and will re-encode on its next save.
pub(crate) fn mutate_active_mods<F>(profile_path: &str, f: F) -> Result<(), AppError>
where
    F: FnOnce(&mut Vec<ModEntry>),
{
    let profile_dir = Path::new(profile_path);
    let sii_path = find_profile_sii(profile_dir)
        .ok_or_else(|| AppError::NotFound("profile.sii not found".into()))?;

    let data = fs::read(&sii_path)?;
    let text = sii::decode_sii_file(&data)?;
    let mut doc = parse_siin(&text).map_err(AppError::SiiDecode)?;

    let obj = doc
        .objects
        .first_mut()
        .ok_or_else(|| AppError::SiiDecode("profile.sii has no objects".into()))?;

    let mut mods = read_active_mods(obj);
    f(&mut mods);
    write_active_mods(obj, &mods);

    let backup = sii_path.with_extension("sii.bak");
    let text = serialize_siin(&doc);
    atomic_replace_verified(&sii_path, Some(&backup), text.as_bytes(), |t| {
        parse_siin(t)
            .map(|_| ())
            .map_err(|e| AppError::SiiDecode(format!("post-write verification failed: {e}")))
    })
}

/// Extract the ordered list of active mods from a parsed profile object.
fn read_active_mods(obj: &SiiObject) -> Vec<ModEntry> {
    let prefix = "active_mods[";
    let mut entries: Vec<(usize, ModEntry)> = obj
        .fields
        .iter()
        .filter_map(|f| {
            if !f.name.starts_with(prefix) {
                return None;
            }
            let idx_str = f.name.strip_prefix(prefix)?.strip_suffix(']')?;
            let idx: usize = idx_str.parse().ok()?;
            let val = match &f.value {
                SiiValue::String(s) => s,
                _ => return None,
            };
            let (id, display_name) = val
                .split_once('|')
                .map(|(i, n)| (i.to_string(), n.to_string()))
                .unwrap_or_else(|| (val.clone(), val.clone()));
            Some((idx, ModEntry { id, display_name }))
        })
        .collect();

    entries.sort_by_key(|(idx, _)| *idx);
    entries.into_iter().map(|(_, m)| m).collect()
}

/// Replace all `active_mods*` fields in `obj` with the given list, preserving
/// the original position of the active_mods block within the object.
fn write_active_mods(obj: &mut SiiObject, mods: &[ModEntry]) {
    let values = mods
        .iter()
        .map(|m| SiiValue::String(format!("{}|{}", m.id, m.display_name)))
        .collect();
    obj.replace_indexed_array("active_mods", values);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_obj() -> SiiObject {
        let text = r#"SiiNunit
{
profile_save : .profile {
 profile_name: "Test"
 active_mods: 2
 active_mods[0]: "mod_a|Mod A"
 active_mods[1]: "mod_b|Mod B"
 company_name: "Test Co"
}
}"#;
        parse_siin(text).unwrap().objects.remove(0)
    }

    #[test]
    fn test_read_active_mods_parses_id_and_name() {
        let obj = sample_obj();
        let mods = read_active_mods(&obj);
        assert_eq!(mods.len(), 2);
        assert_eq!(mods[0].id, "mod_a");
        assert_eq!(mods[0].display_name, "Mod A");
        assert_eq!(mods[1].id, "mod_b");
        assert_eq!(mods[1].display_name, "Mod B");
    }

    #[test]
    fn test_write_active_mods_adds_new_entry() {
        let mut obj = sample_obj();
        let mut mods = read_active_mods(&obj);
        mods.push(ModEntry {
            id: "mod_c".into(),
            display_name: "Mod C".into(),
        });
        write_active_mods(&mut obj, &mods);

        let written = read_active_mods(&obj);
        assert_eq!(written.len(), 3);
        assert_eq!(written[2].id, "mod_c");

        // Count field should be updated
        let count = obj
            .fields
            .iter()
            .find(|f| f.name == "active_mods")
            .and_then(|f| match &f.value {
                SiiValue::Integer(n) => Some(*n),
                _ => None,
            });
        assert_eq!(count, Some(3));
    }

    #[test]
    fn test_write_active_mods_removes_all_when_empty() {
        let mut obj = sample_obj();
        write_active_mods(&mut obj, &[]);

        let remaining: Vec<_> = obj
            .fields
            .iter()
            .filter(|f| f.name.starts_with("active_mods["))
            .collect();
        assert!(remaining.is_empty());

        // Count should be zero
        let count = obj
            .fields
            .iter()
            .find(|f| f.name == "active_mods")
            .and_then(|f| match &f.value {
                SiiValue::Integer(n) => Some(*n),
                _ => None,
            });
        assert_eq!(count, Some(0));
    }

    #[test]
    fn test_write_active_mods_preserves_other_fields() {
        let mut obj = sample_obj();
        let mods = read_active_mods(&obj);
        write_active_mods(&mut obj, &mods);

        assert!(obj.fields.iter().any(|f| f.name == "profile_name"));
        assert!(obj.fields.iter().any(|f| f.name == "company_name"));
    }

    #[test]
    fn test_set_active_mods_replaces_all() {
        let mut obj = sample_obj();
        let new_mods = vec![
            ModEntry {
                id: "mod_x".into(),
                display_name: "Mod X".into(),
            },
            ModEntry {
                id: "mod_y".into(),
                display_name: "Mod Y".into(),
            },
            ModEntry {
                id: "mod_z".into(),
                display_name: "Mod Z".into(),
            },
        ];
        write_active_mods(&mut obj, &new_mods);

        let read = read_active_mods(&obj);
        assert_eq!(read.len(), 3);
        assert_eq!(read[0].id, "mod_x");
        assert_eq!(read[2].id, "mod_z");

        // Other fields preserved.
        assert!(obj.fields.iter().any(|f| f.name == "profile_name"));
        assert!(obj.fields.iter().any(|f| f.name == "company_name"));
    }

    #[test]
    fn test_delete_local_mod_rejects_workshop_ids() {
        let result = delete_local_mod("/tmp", "mod_workshop_package.123");
        assert!(matches!(result, Err(AppError::InvalidPath(_))));
    }
}
