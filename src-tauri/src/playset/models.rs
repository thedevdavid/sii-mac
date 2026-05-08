//! Playset data model.
//!
//! Fields are snake_case across the board because the frontend Zod schemas
//! parse snake_case (matching the existing `FullModInfo`, `ProfileSummary`,
//! etc.). Nothing in this module uses `rename_all = "camelCase"`.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::profile::models::ModEntry;

/// A named collection of mods with load order, enable flags, and presentation
/// metadata. Persisted per-installation in `playsets.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playset {
    pub id: String,
    pub name: String,
    pub is_temporary: bool,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub is_favorite: bool,
    #[serde(default)]
    pub thumbnail_path: Option<String>,
    pub entries: Vec<PlaysetEntry>,
}

/// One mod within a playset. `enabled: false` entries are skipped when the
/// playset is applied. `order` matches vector position after every write.
/// `locked` pins the entry's absolute index during auto-reorder; older
/// playset files without this field default to unlocked via serde.
///
/// `lock_group` ties multiple entries into a sticky cluster: entries sharing
/// the same group id must remain contiguous in their current relative order
/// during auto-reorder, but the cluster as a whole is free to move. `None`
/// means the entry is not part of any group. Older playset files without
/// this field default to `None` via serde.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct PlaysetEntry {
    pub mod_id: String,
    pub display_name: String,
    pub enabled: bool,
    pub order: u32,
    #[serde(default)]
    pub locked: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lock_group: Option<String>,
}

impl PlaysetEntry {
    /// Convert an enabled PlaysetEntry into a ModEntry suitable for writing
    /// into profile.sii's `active_mods` array.
    pub fn to_mod_entry(&self) -> ModEntry {
        ModEntry {
            id: self.mod_id.clone(),
            display_name: self.display_name.clone(),
        }
    }
}

/// Per-profile binding + apply history. One entry per profile, keyed by the
/// canonicalized profile path.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProfilePlaysetState {
    #[serde(default)]
    pub active_playset_id: Option<String>,
    #[serde(default)]
    pub last_applied_playset_id: Option<String>,
    #[serde(default)]
    pub last_applied_at: Option<String>,
    #[serde(default)]
    pub last_applied_snapshot: Vec<PlaysetEntry>,
    /// The id of the auto-managed "live" temporary playset for this profile.
    /// Maintained by `manager::ensure_live_temp_playset` to mirror profile.sii
    /// `active_mods` when no saved playset matches them. Absent when no temp
    /// is needed (e.g. live mods already match a saved playset).
    #[serde(default)]
    pub temp_playset_id: Option<String>,
}

/// Everything persisted for one game installation. Top-level container in
/// `playsets.json`, keyed by `installation:<hash>`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallationPlaysets {
    pub version: u32,
    pub base_path: String,
    #[serde(default)]
    pub playsets: Vec<Playset>,
    #[serde(default)]
    pub profile_states: HashMap<String, ProfilePlaysetState>,
}

impl InstallationPlaysets {
    pub fn new(base_path: String) -> Self {
        Self {
            version: CURRENT_SCHEMA_VERSION,
            base_path,
            playsets: Vec::new(),
            profile_states: HashMap::new(),
        }
    }

    pub fn find_playset(&self, id: &str) -> Option<&Playset> {
        self.playsets.iter().find(|p| p.id == id)
    }

    pub fn find_playset_mut(&mut self, id: &str) -> Option<&mut Playset> {
        self.playsets.iter_mut().find(|p| p.id == id)
    }

    pub fn remove_playset(&mut self, id: &str) -> Option<Playset> {
        let idx = self.playsets.iter().position(|p| p.id == id)?;
        Some(self.playsets.remove(idx))
    }

    pub fn is_playset_active_for_any_profile(&self, playset_id: &str) -> bool {
        self.profile_states
            .values()
            .any(|s| s.active_playset_id.as_deref() == Some(playset_id))
    }
}

pub const CURRENT_SCHEMA_VERSION: u32 = 1;

/// Drift report produced by comparing live `active_mods` against a playset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriftReport {
    pub has_drift: bool,
    pub missing_in_profile: Vec<ModEntry>,
    pub extra_in_profile: Vec<ModEntry>,
    pub order_changed: bool,
    pub snapshot_drift: bool,
    pub live_entries: Vec<ModEntry>,
}

/// JSON wire format for `export_playset` / `import_playset`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaysetExport {
    pub version: u32,
    pub exported_at: String,
    #[serde(default)]
    pub exported_by: Option<String>,
    pub playset: Playset,
}

/// Patch for `update_playset_metadata`. Fields use flat `Option<T>` + explicit
/// `clear_*` booleans rather than nested `Option<Option<T>>`, which serde
/// can't round-trip cleanly through a JSON store.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlaysetMetadataPatch {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub clear_color: Option<bool>,
    #[serde(default)]
    pub is_favorite: Option<bool>,
    #[serde(default)]
    pub thumbnail_path: Option<String>,
    #[serde(default)]
    pub clear_thumbnail_path: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_playset_entry_serde_round_trip() {
        let entry = PlaysetEntry {
            mod_id: "mod_test".into(),
            display_name: "Test Mod".into(),
            enabled: true,
            order: 5,
            ..Default::default()
        };
        let json = serde_json::to_string(&entry).unwrap();
        let parsed: PlaysetEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(entry, parsed);
    }

    #[test]
    fn test_playset_entry_locked_defaults_to_false_when_missing() {
        // Old playsets.json files predate the `locked` field — they must
        // round-trip without errors and produce `locked: false`.
        let json = r#"{"mod_id":"x","display_name":"X","enabled":true,"order":0}"#;
        let parsed: PlaysetEntry = serde_json::from_str(json).unwrap();
        assert!(!parsed.locked);
    }

    #[test]
    fn test_installation_playsets_new_empty() {
        let inst = InstallationPlaysets::new("/game/path".into());
        assert_eq!(inst.version, CURRENT_SCHEMA_VERSION);
        assert_eq!(inst.base_path, "/game/path");
        assert!(inst.playsets.is_empty());
        assert!(inst.profile_states.is_empty());
    }

    #[test]
    fn test_find_playset() {
        let mut inst = InstallationPlaysets::new("/p".into());
        inst.playsets.push(Playset {
            id: "abc".into(),
            name: "Test".into(),
            is_temporary: false,
            created_at: "now".into(),
            updated_at: "now".into(),
            color: None,
            is_favorite: false,
            thumbnail_path: None,
            entries: vec![],
        });
        assert!(inst.find_playset("abc").is_some());
        assert!(inst.find_playset("xyz").is_none());
    }

    #[test]
    fn test_is_playset_active_for_any_profile() {
        let mut inst = InstallationPlaysets::new("/p".into());
        let state = ProfilePlaysetState {
            active_playset_id: Some("ps1".into()),
            ..Default::default()
        };
        inst.profile_states.insert("/profile".into(), state);

        assert!(inst.is_playset_active_for_any_profile("ps1"));
        assert!(!inst.is_playset_active_for_any_profile("ps2"));
    }
}
