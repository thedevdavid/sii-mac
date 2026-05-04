//! Playset CRUD, temporary seeding, apply, and drift acceptance.
//!
//! Every mutation path goes through `with_installation` which holds a
//! process-wide mutex around read→mutate→save so two concurrent Tauri
//! commands can't race on the same playset file.

use std::fs;
use std::path::Path;
use std::sync::{LazyLock, Mutex};

use tauri::AppHandle;
use uuid::Uuid;

use crate::error::AppError;
use crate::profile::metadata::{extract_active_mods_from_obj, find_profile_sii};
use crate::profile::mod_writer::set_active_mods;
use crate::profile::models::ModEntry;
use crate::sii;
use crate::sii::parser::parse_siin;

use super::drift::compute_drift;
use super::models::{
    DriftReport, InstallationPlaysets, Playset, PlaysetEntry, PlaysetMetadataPatch,
};
use super::store::{load_installation, save_installation};

static PLAYSET_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

fn with_installation<F, R>(
    app_handle: &AppHandle,
    base_path: &str,
    f: F,
) -> Result<R, AppError>
where
    F: FnOnce(&mut InstallationPlaysets) -> Result<R, AppError>,
{
    let _guard = PLAYSET_LOCK
        .lock()
        .map_err(|e| AppError::Store(format!("playset lock poisoned: {e}")))?;
    let mut inst = load_installation(app_handle, base_path)?;
    let result = f(&mut inst)?;
    save_installation(app_handle, &inst)?;
    Ok(result)
}

/// Read-only variant of `with_installation`. Loads from the cache (or disk on
/// first hit) and runs the closure without writing back. Use for any command
/// that only reads.
fn with_installation_ro<F, R>(
    app_handle: &AppHandle,
    base_path: &str,
    f: F,
) -> Result<R, AppError>
where
    F: FnOnce(&InstallationPlaysets) -> Result<R, AppError>,
{
    let _guard = PLAYSET_LOCK
        .lock()
        .map_err(|e| AppError::Store(format!("playset lock poisoned: {e}")))?;
    let inst = load_installation(app_handle, base_path)?;
    f(&inst)
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn canonical_profile_path(profile_path: &str) -> String {
    std::fs::canonicalize(profile_path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| profile_path.to_string())
}

// --- Pure helpers (testable without AppHandle) ---

pub fn validate_playset_name(name: &str) -> Result<(), AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::PlaysetInvalid("name cannot be empty".into()));
    }
    if trimmed.len() > 128 {
        return Err(AppError::PlaysetInvalid(
            "name cannot exceed 128 characters".into(),
        ));
    }
    Ok(())
}

/// Build a temporary playset from live `active_mods`. All entries enabled,
/// order = array index.
pub fn seed_temporary_from_live_mods(live: Vec<ModEntry>) -> Playset {
    let now = now_rfc3339();
    let entries = live
        .into_iter()
        .enumerate()
        .map(|(i, m)| PlaysetEntry {
            mod_id: m.id,
            display_name: m.display_name,
            enabled: true,
            order: i as u32,
            locked: false,
        })
        .collect();
    Playset {
        id: Uuid::new_v4().to_string(),
        name: "Temporary".into(),
        is_temporary: true,
        created_at: now.clone(),
        updated_at: now,
        color: None,
        is_favorite: false,
        thumbnail_path: None,
        entries,
    }
}

/// Canonicalize order values to match vector position.
pub fn canonicalize_entries(entries: &mut Vec<PlaysetEntry>) {
    for (i, e) in entries.iter_mut().enumerate() {
        e.order = i as u32;
    }
}

/// Convert enabled entries (sorted by current order) into ModEntries ready
/// for writing into profile.sii.
pub fn entries_to_mod_entries(entries: &[PlaysetEntry]) -> Vec<ModEntry> {
    entries
        .iter()
        .filter(|e| e.enabled)
        .map(PlaysetEntry::to_mod_entry)
        .collect()
}

/// Apply a metadata patch in place.
pub fn apply_metadata_patch(playset: &mut Playset, patch: PlaysetMetadataPatch) -> Result<(), AppError> {
    if let Some(name) = patch.name {
        validate_playset_name(&name)?;
        playset.name = name.trim().to_string();
    }
    if patch.clear_color.unwrap_or(false) {
        playset.color = None;
    } else if let Some(color) = patch.color {
        playset.color = Some(color);
    }
    if let Some(fav) = patch.is_favorite {
        playset.is_favorite = fav;
    }
    if patch.clear_thumbnail_path.unwrap_or(false) {
        playset.thumbnail_path = None;
    } else if let Some(thumb) = patch.thumbnail_path {
        playset.thumbnail_path = Some(thumb);
    }
    playset.updated_at = now_rfc3339();
    Ok(())
}

/// Reorder entries by an ordered id list. Errors if the id set doesn't match.
pub fn reorder_entries(
    entries: &mut Vec<PlaysetEntry>,
    ordered_ids: &[String],
) -> Result<(), AppError> {
    if ordered_ids.len() != entries.len() {
        return Err(AppError::PlaysetInvalid(
            "reorder id list length does not match entry count".into(),
        ));
    }
    let current: std::collections::HashSet<&str> = entries.iter().map(|e| e.mod_id.as_str()).collect();
    for id in ordered_ids {
        if !current.contains(id.as_str()) {
            return Err(AppError::PlaysetInvalid(format!(
                "reorder id '{id}' is not in playset"
            )));
        }
    }
    let mut new_order: Vec<PlaysetEntry> = Vec::with_capacity(entries.len());
    for id in ordered_ids {
        let pos = entries
            .iter()
            .position(|e| e.mod_id == *id)
            .expect("verified above");
        new_order.push(entries.remove(pos));
    }
    *entries = new_order;
    canonicalize_entries(entries);
    Ok(())
}

// --- Public API (takes AppHandle) ---

pub fn list_playsets(
    app_handle: &AppHandle,
    base_path: &str,
) -> Result<Vec<Playset>, AppError> {
    with_installation_ro(app_handle, base_path, |inst| Ok(inst.playsets.clone()))
}

pub fn get_playset(
    app_handle: &AppHandle,
    base_path: &str,
    playset_id: &str,
) -> Result<Playset, AppError> {
    with_installation_ro(app_handle, base_path, |inst| {
        inst.find_playset(playset_id)
            .cloned()
            .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))
    })
}

pub fn create_playset(
    app_handle: &AppHandle,
    base_path: &str,
    name: &str,
) -> Result<Playset, AppError> {
    validate_playset_name(name)?;
    with_installation(app_handle, base_path, |inst| {
        let now = now_rfc3339();
        let playset = Playset {
            id: Uuid::new_v4().to_string(),
            name: name.trim().to_string(),
            is_temporary: false,
            created_at: now.clone(),
            updated_at: now,
            color: None,
            is_favorite: false,
            thumbnail_path: None,
            entries: Vec::new(),
        };
        inst.playsets.push(playset.clone());
        Ok(playset)
    })
}

pub fn duplicate_playset(
    app_handle: &AppHandle,
    base_path: &str,
    playset_id: &str,
    new_name: &str,
) -> Result<Playset, AppError> {
    validate_playset_name(new_name)?;
    with_installation(app_handle, base_path, |inst| {
        let source = inst
            .find_playset(playset_id)
            .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))?
            .clone();
        let now = now_rfc3339();
        let playset = Playset {
            id: Uuid::new_v4().to_string(),
            name: new_name.trim().to_string(),
            is_temporary: false,
            created_at: now.clone(),
            updated_at: now,
            color: source.color.clone(),
            is_favorite: false,
            thumbnail_path: source.thumbnail_path.clone(),
            entries: source.entries.clone(),
        };
        inst.playsets.push(playset.clone());
        Ok(playset)
    })
}

pub fn rename_playset(
    app_handle: &AppHandle,
    base_path: &str,
    playset_id: &str,
    new_name: &str,
) -> Result<Playset, AppError> {
    validate_playset_name(new_name)?;
    with_installation(app_handle, base_path, |inst| {
        let playset = inst
            .find_playset_mut(playset_id)
            .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))?;
        playset.name = new_name.trim().to_string();
        playset.updated_at = now_rfc3339();
        Ok(playset.clone())
    })
}

pub fn delete_playset(
    app_handle: &AppHandle,
    base_path: &str,
    playset_id: &str,
) -> Result<(), AppError> {
    with_installation(app_handle, base_path, |inst| {
        if inst.is_playset_active_for_any_profile(playset_id) {
            return Err(AppError::PlaysetInvalid(
                "cannot delete a playset that is currently active for a profile".into(),
            ));
        }
        inst.remove_playset(playset_id)
            .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))?;
        Ok(())
    })
}

pub fn update_playset_metadata(
    app_handle: &AppHandle,
    base_path: &str,
    playset_id: &str,
    patch: PlaysetMetadataPatch,
) -> Result<Playset, AppError> {
    with_installation(app_handle, base_path, |inst| {
        let playset = inst
            .find_playset_mut(playset_id)
            .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))?;
        apply_metadata_patch(playset, patch)?;
        Ok(playset.clone())
    })
}

pub fn set_playset_entries(
    app_handle: &AppHandle,
    base_path: &str,
    playset_id: &str,
    entries: Vec<PlaysetEntry>,
) -> Result<Playset, AppError> {
    // Check for duplicate mod_ids.
    let mut seen = std::collections::HashSet::new();
    for e in &entries {
        if !seen.insert(&e.mod_id) {
            return Err(AppError::PlaysetInvalid(format!(
                "duplicate mod_id in entries: {}",
                e.mod_id
            )));
        }
    }
    with_installation(app_handle, base_path, |inst| {
        let playset = inst
            .find_playset_mut(playset_id)
            .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))?;
        playset.entries = entries;
        canonicalize_entries(&mut playset.entries);
        playset.updated_at = now_rfc3339();
        Ok(playset.clone())
    })
}

pub fn toggle_entry_enabled(
    app_handle: &AppHandle,
    base_path: &str,
    playset_id: &str,
    mod_id: &str,
    enabled: bool,
) -> Result<Playset, AppError> {
    with_installation(app_handle, base_path, |inst| {
        let playset = inst
            .find_playset_mut(playset_id)
            .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))?;
        let entry = playset
            .entries
            .iter_mut()
            .find(|e| e.mod_id == mod_id)
            .ok_or_else(|| {
                AppError::PlaysetInvalid(format!("mod_id '{mod_id}' not in playset"))
            })?;
        entry.enabled = enabled;
        playset.updated_at = now_rfc3339();
        Ok(playset.clone())
    })
}

pub fn toggle_entry_locked(
    app_handle: &AppHandle,
    base_path: &str,
    playset_id: &str,
    mod_id: &str,
    locked: bool,
) -> Result<Playset, AppError> {
    with_installation(app_handle, base_path, |inst| {
        let playset = inst
            .find_playset_mut(playset_id)
            .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))?;
        let entry = playset
            .entries
            .iter_mut()
            .find(|e| e.mod_id == mod_id)
            .ok_or_else(|| {
                AppError::PlaysetInvalid(format!("mod_id '{mod_id}' not in playset"))
            })?;
        entry.locked = locked;
        playset.updated_at = now_rfc3339();
        Ok(playset.clone())
    })
}

pub fn add_mod_to_playset(
    app_handle: &AppHandle,
    base_path: &str,
    playset_id: &str,
    mod_id: &str,
    display_name: &str,
) -> Result<Playset, AppError> {
    with_installation(app_handle, base_path, |inst| {
        let playset = inst
            .find_playset_mut(playset_id)
            .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))?;
        if playset.entries.iter().any(|e| e.mod_id == mod_id) {
            return Err(AppError::PlaysetInvalid(format!(
                "mod_id '{mod_id}' already in playset"
            )));
        }
        let order = playset.entries.len() as u32;
        playset.entries.push(PlaysetEntry {
            mod_id: mod_id.to_string(),
            display_name: display_name.to_string(),
            enabled: true,
            order,
            locked: false,
        });
        playset.updated_at = now_rfc3339();
        Ok(playset.clone())
    })
}

pub fn remove_mod_from_playset(
    app_handle: &AppHandle,
    base_path: &str,
    playset_id: &str,
    mod_id: &str,
) -> Result<Playset, AppError> {
    with_installation(app_handle, base_path, |inst| {
        let playset = inst
            .find_playset_mut(playset_id)
            .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))?;
        let before = playset.entries.len();
        playset.entries.retain(|e| e.mod_id != mod_id);
        if playset.entries.len() == before {
            return Err(AppError::PlaysetInvalid(format!(
                "mod_id '{mod_id}' not in playset"
            )));
        }
        canonicalize_entries(&mut playset.entries);
        playset.updated_at = now_rfc3339();
        Ok(playset.clone())
    })
}

pub fn reorder_playset_entries(
    app_handle: &AppHandle,
    base_path: &str,
    playset_id: &str,
    ordered_mod_ids: Vec<String>,
) -> Result<Playset, AppError> {
    with_installation(app_handle, base_path, |inst| {
        let playset = inst
            .find_playset_mut(playset_id)
            .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))?;
        reorder_entries(&mut playset.entries, &ordered_mod_ids)?;
        playset.updated_at = now_rfc3339();
        Ok(playset.clone())
    })
}

pub fn set_active_playset(
    app_handle: &AppHandle,
    base_path: &str,
    profile_path: &str,
    playset_id: &str,
) -> Result<(), AppError> {
    with_installation(app_handle, base_path, |inst| {
        if inst.find_playset(playset_id).is_none() {
            return Err(AppError::PlaysetNotFound(playset_id.to_string()));
        }
        let canon = canonical_profile_path(profile_path);
        let state = inst.profile_states.entry(canon).or_default();
        state.active_playset_id = Some(playset_id.to_string());
        Ok(())
    })
}

pub fn get_active_playset(
    app_handle: &AppHandle,
    base_path: &str,
    profile_path: &str,
) -> Result<Playset, AppError> {
    let canon = canonical_profile_path(profile_path);

    // Fast read-only path: an active playset is already wired up. Avoids the
    // disk write that the previous unconditional `with_installation` did.
    if let Some(playset) = with_installation_ro(app_handle, base_path, |inst| {
        Ok(inst
            .profile_states
            .get(&canon)
            .and_then(|s| s.active_playset_id.as_ref())
            .and_then(|id| inst.find_playset(id))
            .cloned())
    })? {
        return Ok(playset);
    }

    // Slow path: no active playset yet — seed a temporary from live active_mods.
    // Read the profile.sii outside the playset lock.
    let live = read_live_active_mods(profile_path)?;

    with_installation(app_handle, base_path, |inst| {
        // Re-check inside the write lock in case another caller seeded one
        // between our RO read and the write lock.
        if let Some(state) = inst.profile_states.get(&canon) {
            if let Some(id) = &state.active_playset_id {
                if let Some(playset) = inst.find_playset(id) {
                    return Ok(playset.clone());
                }
            }
        }

        let mut playset = seed_temporary_from_live_mods(live.clone());
        let playset_id = playset.id.clone();
        let snapshot = playset.entries.clone();
        canonicalize_entries(&mut playset.entries);
        inst.playsets.push(playset.clone());

        let state = inst.profile_states.entry(canon.clone()).or_default();
        state.active_playset_id = Some(playset_id.clone());
        state.last_applied_playset_id = Some(playset_id);
        state.last_applied_at = Some(now_rfc3339());
        state.last_applied_snapshot = snapshot;

        Ok(playset)
    })
}

pub fn save_active_as_playset(
    app_handle: &AppHandle,
    base_path: &str,
    profile_path: &str,
    name: &str,
) -> Result<Playset, AppError> {
    validate_playset_name(name)?;
    with_installation(app_handle, base_path, |inst| {
        let canon = canonical_profile_path(profile_path);
        let state = inst
            .profile_states
            .get(&canon)
            .ok_or_else(|| AppError::PlaysetNotFound("no active playset for profile".into()))?;
        let active_id = state
            .active_playset_id
            .clone()
            .ok_or_else(|| AppError::PlaysetNotFound("no active playset for profile".into()))?;

        let playset = inst
            .find_playset_mut(&active_id)
            .ok_or_else(|| AppError::PlaysetNotFound(active_id.clone()))?;
        if !playset.is_temporary {
            return Err(AppError::PlaysetInvalid(
                "only temporary playsets can be promoted via save_active_as_playset".into(),
            ));
        }
        playset.is_temporary = false;
        playset.name = name.trim().to_string();
        playset.updated_at = now_rfc3339();
        Ok(playset.clone())
    })
}

pub fn apply_playset(
    app_handle: &AppHandle,
    base_path: &str,
    profile_path: &str,
    playset_id: &str,
) -> Result<DriftReport, AppError> {
    let (entries_to_write, snapshot) = with_installation(app_handle, base_path, |inst| {
        let playset = inst
            .find_playset(playset_id)
            .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))?;
        let entries = entries_to_mod_entries(&playset.entries);
        let snapshot = playset.entries.clone();
        Ok((entries, snapshot))
    })?;

    // Write to profile.sii OUTSIDE the playset lock — the mod_writer has its
    // own atomic rename + verification path and we don't want to hold the
    // playset mutex across a filesystem write.
    set_active_mods(profile_path, &entries_to_write)?;

    with_installation(app_handle, base_path, |inst| {
        let canon = canonical_profile_path(profile_path);
        let state = inst.profile_states.entry(canon).or_default();
        state.active_playset_id = Some(playset_id.to_string());
        state.last_applied_playset_id = Some(playset_id.to_string());
        state.last_applied_at = Some(now_rfc3339());
        state.last_applied_snapshot = snapshot.clone();

        let playset = inst
            .find_playset(playset_id)
            .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))?;
        // We just wrote `entries_to_write` to profile.sii — they are the live
        // state. Skip the expensive re-read + SII parse and feed the
        // just-written entries directly into compute_drift.
        Ok(compute_drift(&entries_to_write, playset, Some(&snapshot)))
    })
}

pub fn accept_playset_drift(
    app_handle: &AppHandle,
    base_path: &str,
    profile_path: &str,
    playset_id: &str,
) -> Result<Playset, AppError> {
    // Read live active_mods first (no lock held during filesystem IO).
    let live = read_live_active_mods(profile_path)?;

    with_installation(app_handle, base_path, |inst| {
        let playset = inst
            .find_playset_mut(playset_id)
            .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))?;

        // Overwrite entries from live. Preserve enabled flag where possible
        // (if a mod is enabled in live, it stays enabled in the playset).
        // Carry the user's lock flags across the drift accept so a re-sync
        // doesn't silently unlock previously-pinned entries.
        let prior_locked: std::collections::HashMap<&str, bool> = playset
            .entries
            .iter()
            .map(|e| (e.mod_id.as_str(), e.locked))
            .collect();
        let new_entries: Vec<PlaysetEntry> = live
            .iter()
            .enumerate()
            .map(|(i, m)| PlaysetEntry {
                mod_id: m.id.clone(),
                display_name: m.display_name.clone(),
                enabled: true,
                order: i as u32,
                locked: prior_locked.get(m.id.as_str()).copied().unwrap_or(false),
            })
            .collect();
        playset.entries = new_entries.clone();
        playset.updated_at = now_rfc3339();
        let playset_clone = playset.clone();

        let canon = canonical_profile_path(profile_path);
        let state = inst.profile_states.entry(canon).or_default();
        state.last_applied_playset_id = Some(playset_id.to_string());
        state.last_applied_at = Some(now_rfc3339());
        state.last_applied_snapshot = new_entries;

        Ok(playset_clone)
    })
}

pub fn compute_playset_drift(
    app_handle: &AppHandle,
    base_path: &str,
    profile_path: &str,
    playset_id: &str,
) -> Result<DriftReport, AppError> {
    // Read live active_mods outside the playset lock — it's a filesystem +
    // SII parse and the lock would needlessly block other commands.
    let live = read_live_active_mods(profile_path)?;
    let canon = canonical_profile_path(profile_path);

    with_installation_ro(app_handle, base_path, |inst| {
        let playset = inst
            .find_playset(playset_id)
            .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))?;
        let snapshot = inst.profile_states.get(&canon).and_then(|s| {
            if s.last_applied_playset_id.as_deref() == Some(playset_id) {
                Some(s.last_applied_snapshot.as_slice())
            } else {
                None
            }
        });
        Ok(compute_drift(&live, playset, snapshot))
    })
}

/// Read live active_mods from profile.sii. Exposed pub(crate) so it can be
/// tested and so it doesn't need to hold the playset lock.
pub(crate) fn read_live_active_mods(profile_path: &str) -> Result<Vec<ModEntry>, AppError> {
    let profile_dir = Path::new(profile_path);
    let Some(sii_path) = find_profile_sii(profile_dir) else {
        return Ok(Vec::new());
    };
    let data = fs::read(&sii_path)?;
    let text = sii::decode_sii_file(&data)?;
    let doc = parse_siin(&text).map_err(AppError::SiiDecode)?;
    let Some(obj) = doc.objects.first() else {
        return Ok(Vec::new());
    };
    Ok(extract_active_mods_from_obj(obj))
}

// --- Import a playset into the installation's library ---

pub fn add_imported_playset(
    app_handle: &AppHandle,
    base_path: &str,
    mut playset: Playset,
) -> Result<Playset, AppError> {
    with_installation(app_handle, base_path, |inst| {
        // Regenerate id to avoid collisions with existing library entries.
        playset.id = Uuid::new_v4().to_string();
        playset.is_temporary = false;
        playset.updated_at = now_rfc3339();
        canonicalize_entries(&mut playset.entries);
        inst.playsets.push(playset.clone());
        Ok(playset)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_playset_name_empty_rejected() {
        assert!(validate_playset_name("").is_err());
        assert!(validate_playset_name("   ").is_err());
    }

    #[test]
    fn test_validate_playset_name_too_long_rejected() {
        let long = "a".repeat(129);
        assert!(validate_playset_name(&long).is_err());
    }

    #[test]
    fn test_validate_playset_name_ok() {
        assert!(validate_playset_name("Realism").is_ok());
        assert!(validate_playset_name("Vanilla+").is_ok());
    }

    #[test]
    fn test_seed_temporary_from_live_mods() {
        let live = vec![
            ModEntry {
                id: "mod_a".into(),
                display_name: "Mod A".into(),
            },
            ModEntry {
                id: "mod_b".into(),
                display_name: "Mod B".into(),
            },
        ];
        let ps = seed_temporary_from_live_mods(live);
        assert!(ps.is_temporary);
        assert_eq!(ps.name, "Temporary");
        assert_eq!(ps.entries.len(), 2);
        assert!(ps.entries.iter().all(|e| e.enabled));
        assert_eq!(ps.entries[0].mod_id, "mod_a");
        assert_eq!(ps.entries[0].order, 0);
        assert_eq!(ps.entries[1].order, 1);
    }

    #[test]
    fn test_canonicalize_entries_rewrites_order() {
        let mut entries = vec![
            PlaysetEntry {
                mod_id: "a".into(),
                display_name: "a".into(),
                enabled: true,
                order: 99,
                ..Default::default()
            },
            PlaysetEntry {
                mod_id: "b".into(),
                display_name: "b".into(),
                enabled: false,
                order: 3,
                ..Default::default()
            },
        ];
        canonicalize_entries(&mut entries);
        assert_eq!(entries[0].order, 0);
        assert_eq!(entries[1].order, 1);
    }

    #[test]
    fn test_entries_to_mod_entries_skips_disabled() {
        let entries = vec![
            PlaysetEntry {
                mod_id: "a".into(),
                display_name: "A".into(),
                enabled: true,
                order: 0,
                ..Default::default()
            },
            PlaysetEntry {
                mod_id: "b".into(),
                display_name: "B".into(),
                enabled: false,
                order: 1,
                ..Default::default()
            },
            PlaysetEntry {
                mod_id: "c".into(),
                display_name: "C".into(),
                enabled: true,
                order: 2,
                ..Default::default()
            },
        ];
        let mods = entries_to_mod_entries(&entries);
        assert_eq!(mods.len(), 2);
        assert_eq!(mods[0].id, "a");
        assert_eq!(mods[1].id, "c");
    }

    #[test]
    fn test_apply_metadata_patch_sets_color() {
        let mut ps = make_test_playset();
        let patch = PlaysetMetadataPatch {
            color: Some("#ff0000".into()),
            ..Default::default()
        };
        apply_metadata_patch(&mut ps, patch).unwrap();
        assert_eq!(ps.color.as_deref(), Some("#ff0000"));
    }

    #[test]
    fn test_apply_metadata_patch_clears_color() {
        let mut ps = make_test_playset();
        ps.color = Some("#ff0000".into());
        let patch = PlaysetMetadataPatch {
            clear_color: Some(true),
            ..Default::default()
        };
        apply_metadata_patch(&mut ps, patch).unwrap();
        assert!(ps.color.is_none());
    }

    #[test]
    fn test_apply_metadata_patch_rejects_empty_name() {
        let mut ps = make_test_playset();
        let patch = PlaysetMetadataPatch {
            name: Some("".into()),
            ..Default::default()
        };
        assert!(apply_metadata_patch(&mut ps, patch).is_err());
    }

    #[test]
    fn test_reorder_entries_reverses() {
        let mut entries = vec![
            PlaysetEntry {
                mod_id: "a".into(),
                display_name: "A".into(),
                enabled: true,
                order: 0,
                ..Default::default()
            },
            PlaysetEntry {
                mod_id: "b".into(),
                display_name: "B".into(),
                enabled: true,
                order: 1,
                ..Default::default()
            },
            PlaysetEntry {
                mod_id: "c".into(),
                display_name: "C".into(),
                enabled: true,
                order: 2,
                ..Default::default()
            },
        ];
        reorder_entries(&mut entries, &["c".into(), "a".into(), "b".into()]).unwrap();
        assert_eq!(entries[0].mod_id, "c");
        assert_eq!(entries[1].mod_id, "a");
        assert_eq!(entries[2].mod_id, "b");
        assert_eq!(entries[0].order, 0);
        assert_eq!(entries[2].order, 2);
    }

    #[test]
    fn test_reorder_entries_rejects_mismatched_set() {
        let mut entries = vec![PlaysetEntry {
            mod_id: "a".into(),
            display_name: "A".into(),
            enabled: true,
            order: 0,
            ..Default::default()
        }];
        let result = reorder_entries(&mut entries, &["x".into()]);
        assert!(result.is_err());
    }

    #[test]
    fn test_reorder_entries_rejects_wrong_length() {
        let mut entries = vec![PlaysetEntry {
            mod_id: "a".into(),
            display_name: "A".into(),
            enabled: true,
            order: 0,
            ..Default::default()
        }];
        let result = reorder_entries(&mut entries, &["a".into(), "b".into()]);
        assert!(result.is_err());
    }

    fn make_test_playset() -> Playset {
        Playset {
            id: "test".into(),
            name: "Test".into(),
            is_temporary: false,
            created_at: "now".into(),
            updated_at: "now".into(),
            color: None,
            is_favorite: false,
            thumbnail_path: None,
            entries: vec![],
        }
    }

}
