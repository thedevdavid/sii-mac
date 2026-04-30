//! On-disk cache for Workshop metadata, backed by `tauri_plugin_store`.
//!
//! TTL is 7 days. Lazy GC removes entries older than 30 days when loaded,
//! gated on a `workshop_metadata_last_cleanup` key in settings.json so we
//! don't walk the full cache on every request.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::error::AppError;
use crate::steam::workshop_api::WorkshopMetadata;

const CACHE_FILE: &str = "workshop_metadata.json";
const SETTINGS_FILE: &str = "settings.json";
const LAST_CLEANUP_KEY: &str = "workshop_metadata_last_cleanup";
const CACHE_KEY: &str = "entries";

const TTL_SECS: u64 = 7 * 24 * 60 * 60;
const GC_THRESHOLD_SECS: u64 = 30 * 24 * 60 * 60;
const GC_INTERVAL_SECS: u64 = 24 * 60 * 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkshopMetadataCacheEntry {
    pub metadata: WorkshopMetadata,
    pub fetched_at: u64,
}

/// Is this entry older than the 7-day TTL?
pub fn is_stale(entry: &WorkshopMetadataCacheEntry, now: u64) -> bool {
    now.saturating_sub(entry.fetched_at) >= TTL_SECS
}

/// Load the cache from disk. Runs lazy GC if enough time has passed since
/// the last cleanup.
pub fn load_cache(
    app_handle: &AppHandle,
) -> Result<HashMap<String, WorkshopMetadataCacheEntry>, AppError> {
    let store = app_handle.store(CACHE_FILE)?;
    let raw = store.get(CACHE_KEY).unwrap_or_else(|| serde_json::json!({}));
    let mut cache: HashMap<String, WorkshopMetadataCacheEntry> =
        serde_json::from_value(raw).unwrap_or_default();

    let now = now_secs();
    if should_run_gc(app_handle, now)? {
        cache.retain(|_, entry| now.saturating_sub(entry.fetched_at) <= GC_THRESHOLD_SECS);
        write_cache_map(app_handle, &cache)?;
        mark_gc_ran(app_handle, now)?;
    }

    Ok(cache)
}

/// Persist the cache back to disk.
pub fn save_cache(
    app_handle: &AppHandle,
    cache: &HashMap<String, WorkshopMetadataCacheEntry>,
) -> Result<(), AppError> {
    write_cache_map(app_handle, cache)
}

/// Clear the entire cache (used by the `clear_workshop_metadata_cache` command).
pub fn clear_cache(app_handle: &AppHandle) -> Result<(), AppError> {
    let store = app_handle.store(CACHE_FILE)?;
    store.set(CACHE_KEY, serde_json::json!({}));
    store.save()?;
    Ok(())
}

fn write_cache_map(
    app_handle: &AppHandle,
    cache: &HashMap<String, WorkshopMetadataCacheEntry>,
) -> Result<(), AppError> {
    let store = app_handle.store(CACHE_FILE)?;
    store.set(CACHE_KEY, serde_json::to_value(cache)?);
    store.save()?;
    Ok(())
}

fn should_run_gc(app_handle: &AppHandle, now: u64) -> Result<bool, AppError> {
    let store = app_handle.store(SETTINGS_FILE)?;
    let last = store
        .get(LAST_CLEANUP_KEY)
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    Ok(now.saturating_sub(last) > GC_INTERVAL_SECS)
}

fn mark_gc_ran(app_handle: &AppHandle, now: u64) -> Result<(), AppError> {
    let store = app_handle.store(SETTINGS_FILE)?;
    store.set(LAST_CLEANUP_KEY, serde_json::json!(now));
    store.save()?;
    Ok(())
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_entry(fetched_at: u64) -> WorkshopMetadataCacheEntry {
        WorkshopMetadataCacheEntry {
            metadata: WorkshopMetadata {
                workshop_id: "1".into(),
                title: "Test".into(),
                description: String::new(),
                preview_url: None,
                tags: vec![],
                file_size: None,
                subscribers: None,
                time_updated: None,
                votes_up: None,
                votes_down: None,
            },
            fetched_at,
        }
    }

    #[test]
    fn test_is_stale_fresh_at_day_six() {
        let now = 7 * 24 * 60 * 60;
        let entry = make_entry(now - 6 * 24 * 60 * 60);
        assert!(!is_stale(&entry, now));
    }

    #[test]
    fn test_is_stale_at_day_seven_boundary() {
        let now = 7 * 24 * 60 * 60 + 1;
        let entry = make_entry(1);
        assert!(is_stale(&entry, now));
    }

    #[test]
    fn test_is_stale_at_day_eight() {
        let now = 8 * 24 * 60 * 60;
        let entry = make_entry(0);
        assert!(is_stale(&entry, now));
    }
}
