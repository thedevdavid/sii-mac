//! Workshop metadata commands. Merges on-disk cache with fresh Steam Web API
//! fetches; skips entries still within the 7-day TTL.

use std::collections::HashMap;

use crate::error::AppError;
use crate::steam::workshop_api::{fetch_published_file_details, WorkshopMetadata};
use crate::steam::workshop_cache::{
    clear_cache, is_stale, load_cache, save_cache, WorkshopMetadataCacheEntry,
};

#[tauri::command]
pub async fn fetch_workshop_metadata(
    app_handle: tauri::AppHandle,
    workshop_ids: Vec<String>,
) -> Result<HashMap<String, WorkshopMetadata>, AppError> {
    if workshop_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut cache = load_cache(&app_handle)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // Split into fresh (serve from cache) and stale (fetch from API).
    let mut fresh: HashMap<String, WorkshopMetadata> = HashMap::new();
    let mut to_fetch: Vec<String> = Vec::new();
    for id in workshop_ids {
        if let Some(entry) = cache.get(&id) {
            if !is_stale(entry, now) {
                fresh.insert(id.clone(), entry.metadata.clone());
                continue;
            }
        }
        to_fetch.push(id);
    }

    if !to_fetch.is_empty() {
        let fetched = fetch_published_file_details(&to_fetch).await?;
        for (id, metadata) in fetched {
            cache.insert(
                id.clone(),
                WorkshopMetadataCacheEntry {
                    metadata: metadata.clone(),
                    fetched_at: now,
                },
            );
            fresh.insert(id, metadata);
        }
        save_cache(&app_handle, &cache)?;
    }

    Ok(fresh)
}

#[tauri::command]
pub fn clear_workshop_metadata_cache(app_handle: tauri::AppHandle) -> Result<(), AppError> {
    clear_cache(&app_handle)
}
