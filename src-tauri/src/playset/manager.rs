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

/// Maintain the per-profile "live" temporary playset that mirrors
/// profile.sii's `active_mods` when no saved playset matches them.
///
/// - If `live` matches some non-temp playset's enabled set → drop the temp.
/// - If `live` is empty → drop the temp.
/// - Otherwise → reuse the existing temp (by `temp_playset_id`) or create
///   a new one and record its id.
fn ensure_live_temp_playset(
    inst: &mut super::models::InstallationPlaysets,
    canon: &str,
    live: &[ModEntry],
) {
    use std::collections::HashSet;

    let drop_temp = |inst: &mut super::models::InstallationPlaysets| {
        if let Some(state) = inst.profile_states.get_mut(canon) {
            if let Some(temp_id) = state.temp_playset_id.take() {
                inst.playsets.retain(|p| p.id != temp_id);
            }
        }
    };

    if live.is_empty() {
        drop_temp(inst);
        return;
    }

    let live_ids: HashSet<&str> = live.iter().map(|m| m.id.as_str()).collect();
    let saved_match = inst.playsets.iter().any(|p| {
        if p.is_temporary {
            return false;
        }
        let enabled: HashSet<&str> = p
            .entries
            .iter()
            .filter(|e| e.enabled)
            .map(|e| e.mod_id.as_str())
            .collect();
        enabled == live_ids
    });

    if saved_match {
        drop_temp(inst);
        return;
    }

    // Live doesn't match any saved playset — ensure a temp exists matching it.
    let existing_temp_id = inst
        .profile_states
        .get(canon)
        .and_then(|s| s.temp_playset_id.clone());

    let now = now_rfc3339();
    let entries: Vec<PlaysetEntry> = live
        .iter()
        .enumerate()
        .map(|(i, m)| PlaysetEntry {
            mod_id: m.id.clone(),
            display_name: m.display_name.clone(),
            enabled: true,
            order: i as u32,
            locked: false,
            lock_group: None,
        })
        .collect();

    if let Some(id) = existing_temp_id.as_deref() {
        if let Some(playset) = inst.playsets.iter_mut().find(|p| p.id == id) {
            playset.entries = entries;
            playset.updated_at = now;
            return;
        }
    }

    // Create fresh temp and record its id on the profile state.
    let temp = Playset {
        id: Uuid::new_v4().to_string(),
        name: "Temporary".into(),
        is_temporary: true,
        created_at: now.clone(),
        updated_at: now,
        color: None,
        is_favorite: false,
        thumbnail_path: None,
        entries,
    };
    let temp_id = temp.id.clone();
    inst.playsets.push(temp);
    let state = inst.profile_states.entry(canon.to_string()).or_default();
    state.temp_playset_id = Some(temp_id);
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
            lock_group: None,
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
pub fn canonicalize_entries(entries: &mut [PlaysetEntry]) {
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
    let mut by_id: std::collections::HashMap<String, PlaysetEntry> = std::mem::take(entries)
        .into_iter()
        .map(|e| (e.mod_id.clone(), e))
        .collect();
    let mut new_order: Vec<PlaysetEntry> = Vec::with_capacity(ordered_ids.len());
    for id in ordered_ids {
        let entry = by_id.remove(id).ok_or_else(|| {
            AppError::PlaysetInvalid(format!("reorder id '{id}' is not in playset"))
        })?;
        new_order.push(entry);
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
        // Idempotent: if the mod is already present, return the playset
        // unchanged. The frontend's optimistic-update cache can race with the
        // backend (the user clicks faster than React Query reconciles), and a
        // user-facing "already in playset" error in that case is just noise —
        // the desired end state already holds.
        if playset.entries.iter().any(|e| e.mod_id == mod_id) {
            return Ok(playset.clone());
        }
        let order = playset.entries.len() as u32;
        playset.entries.push(PlaysetEntry {
            mod_id: mod_id.to_string(),
            display_name: display_name.to_string(),
            enabled: true,
            order,
            locked: false,
            lock_group: None,
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
        // Idempotent: removing a mod that isn't in the playset is a no-op.
        // The desired end state ("not present") already holds; surfacing an
        // error here just produces toast noise on rapid clicks.
        if playset.entries.len() != before {
            canonicalize_entries(&mut playset.entries);
            playset.updated_at = now_rfc3339();
        }
        Ok(playset.clone())
    })
}

/// Assign or clear a `lock_group` for a set of entries in one shot. Pass
/// `Some("<uuid>")` to bind the listed mods into a sticky cluster — they will
/// remain contiguous in their current relative order during auto-reorder.
/// Pass `None` to clear the group from each listed mod (ungroup).
///
/// Mods not currently in the playset are silently skipped, since the typical
/// caller is the multi-select toolbar where the selection set may be slightly
/// stale relative to disk state.
pub fn set_entries_lock_group(
    app_handle: &AppHandle,
    base_path: &str,
    playset_id: &str,
    mod_ids: &[String],
    lock_group: Option<&str>,
) -> Result<Playset, AppError> {
    with_installation(app_handle, base_path, |inst| {
        let playset = inst
            .find_playset_mut(playset_id)
            .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))?;
        let target_ids: std::collections::HashSet<&str> =
            mod_ids.iter().map(|s| s.as_str()).collect();
        let mut touched = false;
        for entry in playset.entries.iter_mut() {
            if target_ids.contains(entry.mod_id.as_str()) {
                let new_value = lock_group.map(|s| s.to_string());
                if entry.lock_group != new_value {
                    entry.lock_group = new_value;
                    touched = true;
                }
            }
        }
        if touched {
            playset.updated_at = now_rfc3339();
        }
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

    // Read profile.sii outside the playset lock. Empty result is fine — that
    // just means no live mods, no temp playset to maintain.
    let live = read_live_active_mods(profile_path)?;

    with_installation(app_handle, base_path, |inst| {
        // Always reconcile the per-profile "live" temp playset against the
        // current profile.sii state so the sidebar reflects whatever the
        // game has actually loaded — regardless of what the user picked as
        // their explicit active playset.
        ensure_live_temp_playset(inst, &canon, &live);

        // Honour the user's explicit choice if one is set.
        if let Some(state) = inst.profile_states.get(&canon) {
            if let Some(id) = &state.active_playset_id {
                if let Some(playset) = inst.find_playset(id) {
                    return Ok(playset.clone());
                }
            }
        }

        // No explicit active — promote the live temp (created above) when
        // available, otherwise seed a fresh one.
        let temp_id = inst
            .profile_states
            .get(&canon)
            .and_then(|s| s.temp_playset_id.clone());

        let active_id = match temp_id {
            Some(id) if inst.find_playset(&id).is_some() => id,
            _ => {
                let mut playset = seed_temporary_from_live_mods(live.clone());
                let id = playset.id.clone();
                canonicalize_entries(&mut playset.entries);
                inst.playsets.push(playset);
                id
            }
        };

        let snapshot = inst
            .find_playset(&active_id)
            .map(|p| p.entries.clone())
            .unwrap_or_default();

        let state = inst.profile_states.entry(canon.clone()).or_default();
        state.active_playset_id = Some(active_id.clone());
        state.last_applied_playset_id = Some(active_id.clone());
        state.last_applied_at = Some(now_rfc3339());
        state.last_applied_snapshot = snapshot;

        inst.find_playset(&active_id)
            .cloned()
            .ok_or_else(|| AppError::PlaysetNotFound(active_id))
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
        // Safety: refuse to apply an empty playset. The user's curated mod
        // list is precious — if the playset is somehow empty (regression,
        // bug, accidental drift-accept), don't propagate that to profile.sii.
        // Refusing here preserves the live state until the playset is
        // restored or explicitly emptied by the user.
        if playset.entries.is_empty() {
            return Err(AppError::PlaysetInvalid(format!(
                "refusing to apply empty playset `{}` — it has no entries. \
                 Either add mods to it first, or apply a different playset.",
                playset.name
            )));
        }
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

        // Safety: refuse to wipe a curated playset by accepting an empty live
        // state. The drift "Save changes" button has no undo, and the live
        // state can be empty for plenty of reasons (game just installed,
        // profile reset, wrong profile selected). If the user truly wants
        // an empty playset they can create one explicitly.
        if !playset.entries.is_empty() && live.is_empty() {
            return Err(AppError::PlaysetInvalid(format!(
                "refusing to overwrite playset `{}` ({} entries) with empty profile state — \
                 the live profile has no active mods, which would wipe your playset. \
                 Apply this playset to the profile instead, or edit the playset directly.",
                playset.name,
                playset.entries.len()
            )));
        }

        // Overwrite entries from live. Preserve enabled flag where possible
        // (if a mod is enabled in live, it stays enabled in the playset).
        // Carry the user's lock flags across the drift accept so a re-sync
        // doesn't silently unlock previously-pinned entries.
        let prior_state: std::collections::HashMap<&str, (bool, Option<String>)> = playset
            .entries
            .iter()
            .map(|e| (e.mod_id.as_str(), (e.locked, e.lock_group.clone())))
            .collect();
        let new_entries: Vec<PlaysetEntry> = live
            .iter()
            .enumerate()
            .map(|(i, m)| {
                let prior = prior_state.get(m.id.as_str()).cloned();
                PlaysetEntry {
                    mod_id: m.id.clone(),
                    display_name: m.display_name.clone(),
                    enabled: true,
                    order: i as u32,
                    locked: prior.as_ref().map(|p| p.0).unwrap_or(false),
                    lock_group: prior.and_then(|p| p.1),
                }
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
