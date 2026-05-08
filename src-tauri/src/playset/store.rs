//! Persistence layer for playsets, backed by `tauri_plugin_store`.
//!
//! `playsets.json` is a flat top-level object keyed by `installation:<hash>`.
//! Each value is a `StoreVersioned<InstallationPlaysets>` envelope so future
//! schema migrations stay isolated per installation.

use std::collections::HashMap;
use std::path::Path;
use std::sync::{LazyLock, Mutex};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::error::AppError;

use super::models::{InstallationPlaysets, CURRENT_SCHEMA_VERSION};

const STORE_FILE: &str = "playsets.json";

/// In-memory cache of `InstallationPlaysets` keyed by installation hash. Avoids
/// the disk read on every command. Populated lazily by `load_installation`,
/// kept in sync by `save_installation`. Mutations always go through
/// `save_installation` so cache and disk never diverge.
static CACHE: LazyLock<Mutex<HashMap<String, InstallationPlaysets>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreVersioned<T> {
    pub version: u32,
    pub data: T,
}

/// Compute the store key for a game installation. Canonicalizes the base path,
/// hashes it, takes the first 16 hex chars, prefixes with `installation:`.
/// Falls back to the raw string if canonicalize fails (nonexistent paths in
/// tests).
pub fn installation_key(base_path: &str) -> String {
    let canonical = std::fs::canonicalize(base_path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| base_path.to_string());
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    let hash = hex_encode(&hasher.finalize()[..8]);
    format!("installation:{hash}")
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

/// Load the installation's playsets, preferring the in-memory cache. Falls
/// back to disk on the first access for an installation, then populates the
/// cache. Returns a fresh empty container when no on-disk entry exists.
pub fn load_installation(
    app_handle: &AppHandle,
    base_path: &str,
) -> Result<InstallationPlaysets, AppError> {
    let key = installation_key(base_path);

    if let Ok(cache) = CACHE.lock() {
        if let Some(cached) = cache.get(&key) {
            return Ok(cached.clone());
        }
    }

    let store = app_handle.store(STORE_FILE)?;
    let loaded = match store.get(&key) {
        Some(raw) => {
            let envelope: StoreVersioned<InstallationPlaysets> = serde_json::from_value(raw)
                .map_err(|e| AppError::Store(format!("parse playsets envelope: {e}")))?;
            migrate(envelope)?
        }
        None => InstallationPlaysets::new(base_path.to_string()),
    };

    if let Ok(mut cache) = CACHE.lock() {
        cache.insert(key, loaded.clone());
    }

    Ok(loaded)
}

/// Save the installation's playsets to disk and update the in-memory cache.
pub fn save_installation(
    app_handle: &AppHandle,
    data: &InstallationPlaysets,
) -> Result<(), AppError> {
    let key = installation_key(&data.base_path);
    let envelope = StoreVersioned {
        version: CURRENT_SCHEMA_VERSION,
        data: data.clone(),
    };
    let store = app_handle.store(STORE_FILE)?;
    store.set(
        &key,
        serde_json::to_value(&envelope)
            .map_err(|e| AppError::Store(format!("serialize playsets: {e}")))?,
    );
    store.save()?;

    if let Ok(mut cache) = CACHE.lock() {
        cache.insert(key, data.clone());
    }

    Ok(())
}

/// Placeholder for future migrations. Currently version 1 is the only version.
fn migrate(
    envelope: StoreVersioned<InstallationPlaysets>,
) -> Result<InstallationPlaysets, AppError> {
    match envelope.version {
        v if v == CURRENT_SCHEMA_VERSION => Ok(envelope.data),
        v if v < CURRENT_SCHEMA_VERSION => {
            // Future: run stepwise migrations here.
            Ok(envelope.data)
        }
        v => Err(AppError::Store(format!(
            "unknown playsets schema version: {v}"
        ))),
    }
}

#[allow(dead_code)]
pub(crate) fn raw_install_key_from_path(p: &Path) -> String {
    installation_key(&p.to_string_lossy())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_installation_key_stable_for_nonexistent_path() {
        // Nonexistent → falls back to raw path hashing → same path → same key
        let k1 = installation_key("/nonexistent/test/path");
        let k2 = installation_key("/nonexistent/test/path");
        assert_eq!(k1, k2);
        assert!(k1.starts_with("installation:"));
    }

    #[test]
    fn test_installation_key_differs_for_different_paths() {
        let k1 = installation_key("/nonexistent/path_a");
        let k2 = installation_key("/nonexistent/path_b");
        assert_ne!(k1, k2);
    }

    #[test]
    fn test_installation_key_format() {
        let key = installation_key("/some/path");
        // "installation:" + 16 hex chars
        assert_eq!(key.len(), "installation:".len() + 16);
        let hex = &key["installation:".len()..];
        assert!(hex.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_store_versioned_round_trip() {
        let inst = InstallationPlaysets::new("/test".into());
        let envelope = StoreVersioned {
            version: CURRENT_SCHEMA_VERSION,
            data: inst.clone(),
        };
        let json = serde_json::to_string(&envelope).unwrap();
        let parsed: StoreVersioned<InstallationPlaysets> = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.version, CURRENT_SCHEMA_VERSION);
        assert_eq!(parsed.data.base_path, "/test");
    }

    #[test]
    fn test_migrate_current_version_passthrough() {
        let inst = InstallationPlaysets::new("/test".into());
        let envelope = StoreVersioned {
            version: CURRENT_SCHEMA_VERSION,
            data: inst,
        };
        let result = migrate(envelope).unwrap();
        assert_eq!(result.base_path, "/test");
    }

    #[test]
    fn test_migrate_rejects_unknown_future_version() {
        let inst = InstallationPlaysets::new("/test".into());
        let envelope = StoreVersioned {
            version: 999,
            data: inst,
        };
        let result = migrate(envelope);
        assert!(result.is_err());
    }
}
