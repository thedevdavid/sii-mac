//! Drift detection — comparing a playset's enabled entries against the live
//! `active_mods` list and a historical snapshot.
//!
//! All logic is a pure function so tests don't need a filesystem.

use std::collections::HashSet;

use crate::profile::models::ModEntry;

use super::models::{DriftReport, Playset, PlaysetEntry};

/// Compute drift between a playset and the profile's live `active_mods`.
///
/// - `missing_in_profile`: enabled in playset but not in live
/// - `extra_in_profile`: in live but not enabled in playset
/// - `order_changed`: both have the same enabled set but in different order
/// - `snapshot_drift`: the playset's entries differ from `snapshot` (the
///   snapshot captured at the last apply). True when the user has edited the
///   playset since applying it.
pub fn compute_drift(
    live: &[ModEntry],
    playset: &Playset,
    snapshot: Option<&[PlaysetEntry]>,
) -> DriftReport {
    let enabled: Vec<&PlaysetEntry> = playset.entries.iter().filter(|e| e.enabled).collect();
    let enabled_ids: Vec<&str> = enabled.iter().map(|e| e.mod_id.as_str()).collect();
    let live_ids: Vec<&str> = live.iter().map(|m| m.id.as_str()).collect();
    let enabled_set: HashSet<&str> = enabled_ids.iter().copied().collect();
    let live_set: HashSet<&str> = live_ids.iter().copied().collect();

    let missing_in_profile: Vec<ModEntry> = enabled
        .iter()
        .filter(|e| !live_set.contains(e.mod_id.as_str()))
        .map(|e| e.to_mod_entry())
        .collect();

    let extra_in_profile: Vec<ModEntry> = live
        .iter()
        .filter(|m| !enabled_set.contains(m.id.as_str()))
        .cloned()
        .collect();

    let order_changed = missing_in_profile.is_empty()
        && extra_in_profile.is_empty()
        && enabled_ids != live_ids;

    let snapshot_drift = match snapshot {
        Some(snap) => snap != playset.entries.as_slice(),
        None => false,
    };

    let has_drift = !missing_in_profile.is_empty()
        || !extra_in_profile.is_empty()
        || order_changed
        || snapshot_drift;

    DriftReport {
        has_drift,
        missing_in_profile,
        extra_in_profile,
        order_changed,
        snapshot_drift,
        live_entries: live.to_vec(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, enabled: bool, order: u32) -> PlaysetEntry {
        PlaysetEntry {
            mod_id: id.into(),
            display_name: id.into(),
            enabled,
            order,
            ..Default::default()
        }
    }

    fn mod_e(id: &str) -> ModEntry {
        ModEntry {
            id: id.into(),
            display_name: id.into(),
        }
    }

    fn make_playset(entries: Vec<PlaysetEntry>) -> Playset {
        Playset {
            id: "ps".into(),
            name: "Test".into(),
            is_temporary: false,
            created_at: "now".into(),
            updated_at: "now".into(),
            color: None,
            is_favorite: false,
            thumbnail_path: None,
            entries,
        }
    }

    #[test]
    fn test_no_drift_when_aligned() {
        let ps = make_playset(vec![entry("a", true, 0), entry("b", true, 1)]);
        let live = vec![mod_e("a"), mod_e("b")];
        let report = compute_drift(&live, &ps, Some(ps.entries.as_slice()));
        assert!(!report.has_drift);
    }

    #[test]
    fn test_missing_in_profile() {
        let ps = make_playset(vec![entry("a", true, 0), entry("b", true, 1)]);
        let live = vec![mod_e("a")];
        let report = compute_drift(&live, &ps, None);
        assert!(report.has_drift);
        assert_eq!(report.missing_in_profile.len(), 1);
        assert_eq!(report.missing_in_profile[0].id, "b");
    }

    #[test]
    fn test_extra_in_profile() {
        let ps = make_playset(vec![entry("a", true, 0)]);
        let live = vec![mod_e("a"), mod_e("extra")];
        let report = compute_drift(&live, &ps, None);
        assert!(report.has_drift);
        assert_eq!(report.extra_in_profile.len(), 1);
        assert_eq!(report.extra_in_profile[0].id, "extra");
    }

    #[test]
    fn test_disabled_entries_dont_count_as_missing() {
        let ps = make_playset(vec![entry("a", true, 0), entry("b", false, 1)]);
        let live = vec![mod_e("a")];
        let report = compute_drift(&live, &ps, None);
        assert!(!report.has_drift);
    }

    #[test]
    fn test_order_changed() {
        let ps = make_playset(vec![entry("a", true, 0), entry("b", true, 1)]);
        let live = vec![mod_e("b"), mod_e("a")];
        let report = compute_drift(&live, &ps, None);
        assert!(report.has_drift);
        assert!(report.order_changed);
        assert!(report.missing_in_profile.is_empty());
        assert!(report.extra_in_profile.is_empty());
    }

    #[test]
    fn test_snapshot_drift() {
        let ps = make_playset(vec![entry("a", true, 0), entry("b", true, 1)]);
        let live = vec![mod_e("a"), mod_e("b")];
        // Snapshot has different entries — the user edited the playset since apply.
        let snapshot = vec![entry("a", true, 0)];
        let report = compute_drift(&live, &ps, Some(&snapshot));
        assert!(report.has_drift);
        assert!(report.snapshot_drift);
    }

    #[test]
    fn test_combined_drift() {
        let ps = make_playset(vec![entry("a", true, 0), entry("b", true, 1)]);
        let live = vec![mod_e("c"), mod_e("a")];
        let report = compute_drift(&live, &ps, None);
        assert!(report.has_drift);
        assert_eq!(report.missing_in_profile.len(), 1);
        assert_eq!(report.extra_in_profile.len(), 1);
    }
}
