//! Filesystem mod scanner — finds every mod (local + workshop) for a game
//! installation and parses manifest.sii for metadata.
//!
//! Design: this function deliberately does NOT take `active_mods`. The
//! expensive work (zip-reading each .scs manifest, walking workshop dirs) is
//! profile-independent, so callers cache the result at the installation level
//! and overlay the per-profile active/missing state on top in pure code.
//!
//! Caching: a two-tier cache (in-memory + disk) keyed by canonicalized
//! base_path avoids re-walking the filesystem. The disk tier survives app
//! restarts and is read once per process. Mutations that change the on-disk
//! mod set (currently only `delete_local_mod`) must call
//! `invalidate_installation_mods_cache` to drop both tiers.

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::error::AppError;
use crate::profile::models::{FullModInfo, ModSource, ModStatus};
use crate::sii;

static SCAN_CACHE: LazyLock<Mutex<HashMap<String, Vec<FullModInfo>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

const DISK_CACHE_FILE: &str = "mod_scan_cache.json";

#[derive(Serialize, Deserialize)]
struct DiskScanEntry {
    mods: Vec<FullModInfo>,
}

fn cache_key(base_path: &str) -> String {
    std::fs::canonicalize(base_path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| base_path.to_string())
}

fn load_from_disk(app_handle: &AppHandle, key: &str) -> Option<Vec<FullModInfo>> {
    let store = app_handle.store(DISK_CACHE_FILE).ok()?;
    let raw = store.get(key)?;
    let entry: DiskScanEntry = serde_json::from_value(raw).ok()?;
    Some(entry.mods)
}

fn save_to_disk(app_handle: &AppHandle, key: &str, mods: &[FullModInfo]) {
    let Ok(store) = app_handle.store(DISK_CACHE_FILE) else {
        return;
    };
    let entry = DiskScanEntry {
        mods: mods.to_vec(),
    };
    let Ok(value) = serde_json::to_value(&entry) else {
        return;
    };
    store.set(key, value);
    let _ = store.save();
}

fn remove_from_disk(app_handle: &AppHandle, key: &str) {
    let Ok(store) = app_handle.store(DISK_CACHE_FILE) else {
        return;
    };
    store.delete(key);
    let _ = store.save();
}

/// Scan every mod available in a game installation. Workshop items that lack
/// a readable `manifest.sii` fall back to Steam's `appworkshop_{app_id}.acf`
/// title, then to a `Workshop #{id}` placeholder.
///
/// All returned mods have `status = "inactive"` — callers overlay the
/// per-profile active/missing state themselves. Results are unsorted; callers
/// typically re-sort after merging with profile data.
///
/// Results are cached two ways: an in-process map for hot calls, plus a
/// JSON file on disk that survives restarts (so the first scan after launch
/// doesn't re-walk every workshop folder). Mutations that alter the mod
/// directory must call `invalidate_installation_mods_cache` to drop both.
pub fn scan_installation_mods(
    app_handle: Option<&AppHandle>,
    base_path: &str,
) -> Result<Vec<FullModInfo>, AppError> {
    let key = cache_key(base_path);

    if let Ok(cache) = SCAN_CACHE.lock() {
        if let Some(cached) = cache.get(&key) {
            return Ok(cached.clone());
        }
    }

    if let Some(handle) = app_handle {
        if let Some(mods) = load_from_disk(handle, &key) {
            if let Ok(mut cache) = SCAN_CACHE.lock() {
                cache.insert(key.clone(), mods.clone());
            }
            return Ok(mods);
        }
    }

    let mods = scan_installation_mods_uncached(base_path)?;

    if let Ok(mut cache) = SCAN_CACHE.lock() {
        cache.insert(key.clone(), mods.clone());
    }
    if let Some(handle) = app_handle {
        save_to_disk(handle, &key, &mods);
    }

    Ok(mods)
}

/// Drop the cache entry for the given installation. Call after any mutation
/// that changes the mod directory (e.g. `delete_local_mod`) so the next scan
/// observes the new state.
pub fn invalidate_installation_mods_cache(app_handle: Option<&AppHandle>, base_path: &str) {
    let key = cache_key(base_path);
    if let Ok(mut cache) = SCAN_CACHE.lock() {
        cache.remove(&key);
    }
    if let Some(handle) = app_handle {
        remove_from_disk(handle, &key);
    }
}

/// Internal scan helper. Bypasses the cache — callers should prefer
/// `scan_installation_mods` or explicit cache management.
fn scan_installation_mods_uncached(base_path: &str) -> Result<Vec<FullModInfo>, AppError> {
    let base = Path::new(base_path);

    // Run local and workshop scans concurrently — neither depends on the
    // other and both are dominated by I/O, so rayon's join lets them overlap
    // at negligible cost.
    let (local_result, workshop_mods) = rayon::join(
        || {
            let local_mod_dir = base.join("mod");
            if local_mod_dir.exists() {
                scan_local_mods(&local_mod_dir)
            } else {
                Ok(Vec::new())
            }
        },
        || scan_workshop_mods(base_path),
    );

    let mut all_mods: HashMap<String, FullModInfo> = HashMap::new();
    for mod_info in local_result? {
        all_mods.insert(mod_info.id.clone(), mod_info);
    }
    for mod_info in workshop_mods {
        all_mods.insert(mod_info.id.clone(), mod_info);
    }

    Ok(all_mods.into_values().collect())
}

/// Scan local `.scs` archives and unpacked mod directories in parallel.
fn scan_local_mods(mod_dir: &Path) -> Result<Vec<FullModInfo>, AppError> {
    // Collect directory entries up front so rayon can split the work evenly.
    let entries: Vec<_> = fs::read_dir(mod_dir)?
        .flatten()
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .map(|n| !n.starts_with('.'))
                .unwrap_or(false)
        })
        .collect();

    let mods: Vec<FullModInfo> = entries
        .par_iter()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path();
            let meta = entry.metadata().ok()?;

            let is_scs_file = meta.is_file()
                && Path::new(&name)
                    .extension()
                    .and_then(|e| e.to_str())
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("scs"));
            let (manifest, size) = if is_scs_file {
                (read_manifest_from_scs(&path), Some(meta.len()))
            } else if meta.is_dir() {
                (read_manifest_from_dir(&path), None)
            } else {
                return None;
            };

            let mod_id = if is_scs_file {
                Path::new(&name)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| name.clone())
            } else {
                name.clone()
            };
            Some(match manifest {
                Some(m) => FullModInfo {
                    id: mod_id.clone(),
                    display_name: m.display_name.unwrap_or(mod_id),
                    status: ModStatus::Inactive,
                    source: ModSource::Local,
                    author: m.author,
                    version: m.version,
                    categories: m.categories,
                    compatible_versions: m.compatible_versions,
                    size,
                    workshop_id: None,
                },
                None => FullModInfo {
                    id: mod_id.clone(),
                    display_name: mod_id,
                    status: ModStatus::Inactive,
                    source: ModSource::Local,
                    author: None,
                    version: None,
                    categories: Vec::new(),
                    compatible_versions: Vec::new(),
                    size,
                    workshop_id: None,
                },
            })
        })
        .collect();

    Ok(mods)
}

/// Scan every known Steam Workshop `content/{app_id}` directory in parallel.
/// Also harvests titles from `appworkshop_{app_id}.acf` so mods without a
/// usable `manifest.sii` still get a human-readable name.
fn scan_workshop_mods(base_path: &str) -> Vec<FullModInfo> {
    // Use the central game→app-id mapping rather than re-deriving from
    // substring matching here. `app_id_from_game_base` checks for real
    // marker files first and falls back to name-based detection, matching
    // whatever Steam installed.
    let app_id = crate::steam::app_id_from_game_base(Path::new(base_path));

    let (workshop_dirs, workshop_manifests) = discover_workshop_paths(app_id);

    // Steam's ACF file is tiny — read it once up front on the current thread.
    let steam_titles: HashMap<String, String> = workshop_manifests
        .iter()
        .flat_map(|m| read_appworkshop_titles(m).unwrap_or_default())
        .collect();

    // Flatten every workshop entry across every candidate directory into a
    // single list so rayon can spread the manifest reads across cores.
    let entries: Vec<PathBuf> = workshop_dirs
        .iter()
        .filter(|d| d.exists())
        .flat_map(|ws_dir| {
            fs::read_dir(ws_dir)
                .ok()
                .into_iter()
                .flatten()
                .flatten()
                .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                .map(|e| e.path())
                .collect::<Vec<_>>()
        })
        .collect();

    entries
        .par_iter()
        .map(|entry_path| {
            let ws_item_id = entry_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            // Workshop mod ID: hex-encode the numeric ID to match active_mods format
            let hex_id = format!("{:016X}", ws_item_id.parse::<u64>().unwrap_or(0));
            let mod_id = format!("mod_workshop_package.{}", hex_id);

            // Try "latest/" subdir first, then the root of the workshop item.
            let manifest = read_manifest_from_dir(&entry_path.join("latest"))
                .or_else(|| read_manifest_from_dir(entry_path));

            // Resolve the best available display name in priority order:
            //   1. mod's own manifest.sii display_name
            //   2. Steam's appworkshop_{app}.acf title
            //   3. "Workshop #{id}" placeholder
            // (The per-profile active_mods name gets applied later in the
            // frontend overlay, where it has access to the loaded profile.)
            let display_name = manifest
                .as_ref()
                .and_then(|m| m.display_name.clone())
                .or_else(|| steam_titles.get(&ws_item_id).cloned())
                .unwrap_or_else(|| format!("Workshop #{}", ws_item_id));

            match manifest {
                Some(m) => FullModInfo {
                    id: mod_id,
                    display_name,
                    status: ModStatus::Inactive,
                    source: ModSource::Workshop,
                    author: m.author,
                    version: m.version,
                    categories: m.categories,
                    compatible_versions: m.compatible_versions,
                    size: None,
                    workshop_id: Some(ws_item_id),
                },
                None => FullModInfo {
                    id: mod_id,
                    display_name,
                    status: ModStatus::Inactive,
                    source: ModSource::Workshop,
                    author: None,
                    version: None,
                    categories: Vec::new(),
                    compatible_versions: Vec::new(),
                    size: None,
                    workshop_id: Some(ws_item_id),
                },
            }
        })
        .collect()
}

/// Enumerate every candidate `workshop/content/{app_id}` directory and paired
/// `appworkshop_{app_id}.acf` manifest location that might exist on this host.
/// Steam root discovery lives in [`crate::steam`].
fn discover_workshop_paths(app_id: &str) -> (Vec<PathBuf>, Vec<PathBuf>) {
    let mut workshop_dirs: Vec<PathBuf> = Vec::new();
    let mut workshop_manifests: Vec<PathBuf> = Vec::new();

    for steamapps in crate::steam::steam_steamapps_roots() {
        let ws_path = steamapps.join("workshop/content").join(app_id);
        if ws_path.exists() {
            workshop_dirs.push(ws_path);
        }
        let manifest = steamapps.join(format!("workshop/appworkshop_{app_id}.acf"));
        workshop_manifests.push(manifest);
    }

    (workshop_dirs, workshop_manifests)
}

/// Parse `appworkshop_{app_id}.acf` and return a map from workshop item id to
/// the `title` field. The file is a Valve VDF document, but we only need the
/// `"<numeric id>" { "title" "..." }` pairs, so we do a small line-based pass
/// rather than pulling in a full VDF parser.
fn read_appworkshop_titles(acf_path: &Path) -> Option<HashMap<String, String>> {
    let text = fs::read_to_string(acf_path).ok()?;
    let mut titles = HashMap::new();
    let mut current_id: Option<String> = None;

    for line in text.lines() {
        let trimmed = line.trim();
        // "<numeric-id>"
        if current_id.is_none()
            && trimmed.starts_with('"')
            && trimmed.ends_with('"')
            && trimmed.len() > 2
        {
            let inner = &trimmed[1..trimmed.len() - 1];
            if inner.chars().all(|c| c.is_ascii_digit()) && !inner.is_empty() {
                current_id = Some(inner.to_string());
            }
            continue;
        }
        if let Some(id) = current_id.as_ref() {
            if let Some(title) = trimmed.strip_prefix("\"title\"") {
                let value = title
                    .trim_start()
                    .trim_start_matches('"')
                    .trim_end_matches('"');
                if !value.is_empty() {
                    titles.insert(id.clone(), value.to_string());
                }
                current_id = None;
            } else if trimmed == "}" {
                current_id = None;
            }
        }
    }

    if titles.is_empty() {
        None
    } else {
        Some(titles)
    }
}

// --- Manifest parsing ---

struct ManifestData {
    display_name: Option<String>,
    author: Option<String>,
    version: Option<String>,
    categories: Vec<String>,
    compatible_versions: Vec<String>,
}

/// Read manifest.sii from a directory.
fn read_manifest_from_dir(dir: &Path) -> Option<ManifestData> {
    let manifest_path = dir.join("manifest.sii");
    if !manifest_path.exists() {
        return None;
    }
    let text = fs::read_to_string(&manifest_path).ok()?;
    parse_manifest(&text)
}

/// Read manifest.sii from inside a .scs zip archive.
fn read_manifest_from_scs(scs_path: &Path) -> Option<ManifestData> {
    let file = fs::File::open(scs_path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;
    let mut entry = archive.by_name("manifest.sii").ok()?;
    let mut text = String::new();
    entry.read_to_string(&mut text).ok()?;
    parse_manifest(&text)
}

/// Parse manifest.sii text to extract mod metadata.
fn parse_manifest(text: &str) -> Option<ManifestData> {
    let display_name = sii::first_object_string(text, "display_name");
    let author = sii::first_object_string(text, "author");
    let version = sii::first_object_string(text, "package_version");
    let categories = sii::first_object_string_list(text, "category[]");
    let compatible_versions = sii::first_object_string_list(text, "compatible_versions[]");

    Some(ManifestData {
        display_name,
        author,
        version,
        categories,
        compatible_versions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_appworkshop_titles_parses_subscribed_items() {
        let acf = r#""AppWorkshop"
{
    "appid"        "270880"
    "WorkshopItemsInstalled"
    {
        "1234567890"
        {
            "size"        "12345"
            "timeupdated" "1700000000"
        }
    }
    "WorkshopItemDetails"
    {
        "1234567890"
        {
            "manifest"    "999"
            "timeupdated" "1700000000"
            "title"       "My Realistic Physics Mod"
        }
        "9876543210"
        {
            "manifest"    "888"
            "title"       "Traffic Pack"
        }
    }
}
"#;
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("appworkshop_270880.acf");
        std::fs::write(&path, acf).unwrap();

        let titles = read_appworkshop_titles(&path).unwrap();
        assert_eq!(
            titles.get("1234567890").map(String::as_str),
            Some("My Realistic Physics Mod")
        );
        assert_eq!(
            titles.get("9876543210").map(String::as_str),
            Some("Traffic Pack")
        );
    }

    #[test]
    fn test_read_appworkshop_titles_returns_none_for_missing_file() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("does_not_exist_appworkshop.acf");
        assert!(read_appworkshop_titles(&path).is_none());
    }

    #[test]
    fn test_scan_empty_installation_returns_empty() {
        let tmp = tempfile::tempdir().unwrap();
        let result = scan_installation_mods(None, tmp.path().to_str().unwrap()).unwrap();
        // No `mod/` subdir and no workshop dirs configured — the function
        // should return cleanly with no panic.
        assert!(
            result.is_empty() || result.iter().all(|m| m.source == ModSource::Workshop),
            "Expected empty or workshop-only result, got {result:?}"
        );
    }

    #[test]
    fn test_parse_manifest_extracts_display_name_and_categories() {
        let text = r#"SiiNunit
{
mod_package : .package {
 display_name: "Test Mod"
 author: "Me"
 package_version: "1.2.3"
 category[]: "truck"
 category[]: "interior"
 compatible_versions[]: "1.50"
}
}"#;
        let m = parse_manifest(text).unwrap();
        assert_eq!(m.display_name.as_deref(), Some("Test Mod"));
        assert_eq!(m.author.as_deref(), Some("Me"));
        assert_eq!(m.version.as_deref(), Some("1.2.3"));
        assert_eq!(m.categories, vec!["truck", "interior"]);
        assert_eq!(m.compatible_versions, vec!["1.50"]);
    }

    #[test]
    fn test_scan_cache_returns_same_result_on_second_call() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path().to_str().unwrap().to_string();

        let first = scan_installation_mods(None, &base).unwrap();
        let second = scan_installation_mods(None, &base).unwrap();

        assert_eq!(first.len(), second.len());
        // Prove the cache is actually holding an entry by inspecting it.
        let key = cache_key(&base);
        let cache = SCAN_CACHE.lock().unwrap();
        assert!(cache.contains_key(&key));
    }

    #[test]
    fn test_invalidate_cache_removes_entry() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path().to_str().unwrap().to_string();

        let _ = scan_installation_mods(None, &base).unwrap();
        let key = cache_key(&base);
        assert!(SCAN_CACHE.lock().unwrap().contains_key(&key));

        invalidate_installation_mods_cache(None, &base);
        assert!(!SCAN_CACHE.lock().unwrap().contains_key(&key));
    }
}
