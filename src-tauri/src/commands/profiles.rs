use std::path::PathBuf;

use tauri::ipc::Channel;
use tauri_plugin_store::StoreExt;

use crate::error::AppError;
use crate::profile::models::{
    CloneOptions, FullModInfo, GameInstallation, InstallSource, ProfileContents, ProfileDetail,
    ProfileSummary,
};
use crate::profile::{cloner, detection, manager, mod_scanner, mod_writer, scanner};
use crate::progress::{CancelRegistry, ProgressEmitter, ProgressEvent};

#[tauri::command]
pub fn detect_game_installations(
    app_handle: tauri::AppHandle,
) -> Result<Vec<GameInstallation>, AppError> {
    let custom_paths = read_custom_paths(&app_handle)?;
    detection::detect_with_custom_paths(&custom_paths)
}

#[tauri::command]
pub fn add_custom_game_path(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<GameInstallation, AppError> {
    // Canonicalize so two different spellings of the same directory
    // (trailing slash, `..`, symlink traversal) don't produce duplicate
    // entries — the deduplication check below compares canonical strings.
    let canonical = std::fs::canonicalize(&path)
        .map_err(|e| AppError::InvalidPath(format!("could not resolve `{path}`: {e}")))?;
    let canonical_str = canonical.to_string_lossy().to_string();

    let game = detection::validate_game_path(&canonical_str).ok_or_else(|| {
        AppError::InvalidPath(
            "Not a valid game directory. Must contain a 'profiles' folder.".into(),
        )
    })?;

    let mut paths = read_custom_paths(&app_handle)?;
    if paths.contains(&canonical_str) {
        return Err(AppError::AlreadyExists(
            "This directory is already added".into(),
        ));
    }

    paths.push(canonical_str.clone());
    write_custom_paths(&app_handle, &paths)?;

    let profiles_path = PathBuf::from(&canonical_str).join("profiles");
    Ok(GameInstallation {
        game,
        base_path: canonical_str,
        profiles_path: profiles_path.to_string_lossy().to_string(),
        is_custom: true,
        source: InstallSource::Custom,
    })
}

#[tauri::command]
pub fn remove_custom_game_path(app_handle: tauri::AppHandle, path: String) -> Result<(), AppError> {
    // Remove by either the raw string or the canonicalized form so the
    // caller can pass in whichever representation they're holding.
    let canonical = std::fs::canonicalize(&path)
        .ok()
        .map(|p| p.to_string_lossy().to_string());
    let mut paths = read_custom_paths(&app_handle)?;
    paths.retain(|p| p != &path && Some(p.clone()) != canonical);
    write_custom_paths(&app_handle, &paths)
}

#[tauri::command]
pub fn list_profiles(profiles_path: String) -> Result<Vec<ProfileSummary>, AppError> {
    manager::list_profiles(&profiles_path)
}

#[tauri::command]
pub fn get_profile_detail(profile_path: String) -> Result<ProfileDetail, AppError> {
    manager::get_profile_detail(&profile_path)
}

#[tauri::command]
pub fn scan_profile_contents(profile_path: String) -> Result<ProfileContents, AppError> {
    scanner::scan_profile_contents(&profile_path)
}

#[tauri::command]
pub fn clone_profile(
    cancel_registry: tauri::State<'_, CancelRegistry>,
    source_path: String,
    new_name: String,
    game_base_path: Option<String>,
    options: Option<CloneOptions>,
    job_id: String,
    progress: Channel<ProgressEvent>,
) -> Result<ProfileSummary, AppError> {
    let opts = options.unwrap_or_default();
    // Always clone to the local profiles/ directory (not steam_profiles/)
    let target_dir = game_base_path.map(|base| std::path::PathBuf::from(base).join("profiles"));

    // Register the cancel flag for this job_id. The guard drops at the end of
    // the function and automatically cleans up the registry entry.
    let guard = cancel_registry.register(job_id);
    let mut emitter = ProgressEmitter::new(progress).with_cancel_flag(guard.flag());

    let result = cloner::clone_profile(
        &source_path,
        &new_name,
        target_dir.as_deref(),
        &opts,
        Some(&mut emitter),
        Some(&guard),
    );

    match &result {
        Ok(_) => emitter.completed(format!("Cloned profile as {new_name}")),
        Err(AppError::Cancelled) => emitter.cancelled(),
        Err(e) => emitter.failed(e.to_string()),
    }
    result
}

#[tauri::command]
pub fn rename_profile(profile_path: String, new_name: String) -> Result<ProfileSummary, AppError> {
    manager::rename_profile(&profile_path, &new_name)
}

#[tauri::command]
pub fn delete_profile(profile_path: String) -> Result<(), AppError> {
    manager::delete_profile(&profile_path)
}

#[tauri::command]
pub fn scan_installation_mods(base_path: String) -> Result<Vec<FullModInfo>, AppError> {
    mod_scanner::scan_installation_mods(&base_path)
}

#[tauri::command]
pub fn refresh_installation_mods(base_path: String) -> Result<Vec<FullModInfo>, AppError> {
    mod_scanner::invalidate_installation_mods_cache(&base_path);
    mod_scanner::scan_installation_mods(&base_path)
}

#[tauri::command]
pub fn delete_local_mod(base_path: String, mod_id: String) -> Result<(), AppError> {
    mod_writer::delete_local_mod(&base_path, &mod_id)
}

// --- Store helpers ---

fn read_custom_paths(app_handle: &tauri::AppHandle) -> Result<Vec<String>, AppError> {
    let store = app_handle.store("settings.json")?;
    match store.get("custom_game_paths") {
        Some(val) => {
            serde_json::from_value(val.clone()).map_err(|e| AppError::Store(e.to_string()))
        }
        None => Ok(Vec::new()),
    }
}

fn write_custom_paths(app_handle: &tauri::AppHandle, paths: &[String]) -> Result<(), AppError> {
    let store = app_handle.store("settings.json")?;
    store.set(
        "custom_game_paths",
        serde_json::to_value(paths).map_err(|e| AppError::Store(e.to_string()))?,
    );
    store.save()?;
    Ok(())
}
