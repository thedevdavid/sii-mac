//! Import/export of playsets as JSON files.
//!
//! Export uses `atomic_replace_verified` (same primitive that protects
//! profile.sii) so a crash mid-write can't leave a half-written file.
//! Import validates the version envelope and regenerates the id before
//! appending to the installation library.

use std::fs;
use std::path::Path;

use tauri::AppHandle;

use crate::error::AppError;
use crate::utils::atomic_replace_verified;

use super::manager::add_imported_playset;
use super::models::{Playset, PlaysetExport, CURRENT_SCHEMA_VERSION};
use super::store::load_installation;

const APP_NAME: &str = concat!("sii-mac v", env!("CARGO_PKG_VERSION"));

pub fn export_playset(
    app_handle: &AppHandle,
    base_path: &str,
    playset_id: &str,
    destination_path: &str,
) -> Result<(), AppError> {
    let inst = load_installation(app_handle, base_path)?;
    let playset = inst
        .find_playset(playset_id)
        .ok_or_else(|| AppError::PlaysetNotFound(playset_id.to_string()))?
        .clone();

    let export = PlaysetExport {
        version: CURRENT_SCHEMA_VERSION,
        exported_at: chrono::Utc::now().to_rfc3339(),
        exported_by: Some(APP_NAME.to_string()),
        playset,
    };

    let bytes = encode_export(&export)?;
    let dest = Path::new(destination_path);
    atomic_replace_verified(dest, None, &bytes, |text| {
        serde_json::from_str::<PlaysetExport>(text)
            .map(|_| ())
            .map_err(|e| AppError::PlaysetInvalid(format!("post-write verification: {e}")))
    })?;
    Ok(())
}

pub fn import_playset(
    app_handle: &AppHandle,
    base_path: &str,
    source_path: &str,
) -> Result<Playset, AppError> {
    let text = fs::read_to_string(source_path)
        .map_err(|e| AppError::PlaysetInvalid(format!("cannot read file: {e}")))?;
    let export = decode_export(&text)?;
    add_imported_playset(app_handle, base_path, export.playset)
}

pub fn encode_export(export: &PlaysetExport) -> Result<Vec<u8>, AppError> {
    serde_json::to_vec_pretty(export).map_err(AppError::from)
}

pub fn decode_export(text: &str) -> Result<PlaysetExport, AppError> {
    let export: PlaysetExport = serde_json::from_str(text)
        .map_err(|e| AppError::PlaysetInvalid(format!("invalid playset JSON: {e}")))?;
    if export.version > CURRENT_SCHEMA_VERSION {
        return Err(AppError::PlaysetInvalid(format!(
            "playset version {} is newer than supported version {}",
            export.version, CURRENT_SCHEMA_VERSION
        )));
    }
    Ok(export)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::playset::models::{Playset, PlaysetEntry};

    fn sample_export() -> PlaysetExport {
        PlaysetExport {
            version: 1,
            exported_at: "2026-01-01T00:00:00Z".into(),
            exported_by: Some("test".into()),
            playset: Playset {
                id: "abc".into(),
                name: "Test".into(),
                is_temporary: false,
                created_at: "2026-01-01T00:00:00Z".into(),
                updated_at: "2026-01-01T00:00:00Z".into(),
                color: None,
                is_favorite: false,
                thumbnail_path: None,
                entries: vec![PlaysetEntry {
                    mod_id: "mod_x".into(),
                    display_name: "Mod X".into(),
                    enabled: true,
                    order: 0,
                }],
            },
        }
    }

    #[test]
    fn test_encode_decode_round_trip() {
        let original = sample_export();
        let bytes = encode_export(&original).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        let parsed = decode_export(&text).unwrap();
        assert_eq!(parsed.version, 1);
        assert_eq!(parsed.playset.name, "Test");
        assert_eq!(parsed.playset.entries.len(), 1);
    }

    #[test]
    fn test_decode_rejects_future_version() {
        let mut export = sample_export();
        export.version = 99;
        let bytes = encode_export(&export).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        let result = decode_export(&text);
        assert!(result.is_err());
    }

    #[test]
    fn test_decode_rejects_malformed_json() {
        let result = decode_export("not valid json at all");
        assert!(result.is_err());
    }
}
