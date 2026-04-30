//! Tauri command wrappers for playset operations. Thin forwarders to
//! `crate::playset::manager` and `crate::playset::io`.

use crate::error::AppError;
use crate::playset::{
    io,
    manager,
    models::{DriftReport, Playset, PlaysetEntry, PlaysetMetadataPatch},
};

#[tauri::command]
pub fn list_playsets(
    app_handle: tauri::AppHandle,
    base_path: String,
) -> Result<Vec<Playset>, AppError> {
    manager::list_playsets(&app_handle, &base_path)
}

#[tauri::command]
pub fn get_playset(
    app_handle: tauri::AppHandle,
    base_path: String,
    playset_id: String,
) -> Result<Playset, AppError> {
    manager::get_playset(&app_handle, &base_path, &playset_id)
}

#[tauri::command]
pub fn get_active_playset(
    app_handle: tauri::AppHandle,
    base_path: String,
    profile_path: String,
) -> Result<Playset, AppError> {
    manager::get_active_playset(&app_handle, &base_path, &profile_path)
}

#[tauri::command]
pub fn create_playset(
    app_handle: tauri::AppHandle,
    base_path: String,
    name: String,
) -> Result<Playset, AppError> {
    manager::create_playset(&app_handle, &base_path, &name)
}

#[tauri::command]
pub fn duplicate_playset(
    app_handle: tauri::AppHandle,
    base_path: String,
    playset_id: String,
    new_name: String,
) -> Result<Playset, AppError> {
    manager::duplicate_playset(&app_handle, &base_path, &playset_id, &new_name)
}

#[tauri::command]
pub fn rename_playset(
    app_handle: tauri::AppHandle,
    base_path: String,
    playset_id: String,
    new_name: String,
) -> Result<Playset, AppError> {
    manager::rename_playset(&app_handle, &base_path, &playset_id, &new_name)
}

#[tauri::command]
pub fn delete_playset(
    app_handle: tauri::AppHandle,
    base_path: String,
    playset_id: String,
) -> Result<(), AppError> {
    manager::delete_playset(&app_handle, &base_path, &playset_id)
}

#[tauri::command]
pub fn update_playset_metadata(
    app_handle: tauri::AppHandle,
    base_path: String,
    playset_id: String,
    patch: PlaysetMetadataPatch,
) -> Result<Playset, AppError> {
    manager::update_playset_metadata(&app_handle, &base_path, &playset_id, patch)
}

#[tauri::command]
pub fn set_playset_entries(
    app_handle: tauri::AppHandle,
    base_path: String,
    playset_id: String,
    entries: Vec<PlaysetEntry>,
) -> Result<Playset, AppError> {
    manager::set_playset_entries(&app_handle, &base_path, &playset_id, entries)
}

#[tauri::command]
pub fn toggle_entry_enabled(
    app_handle: tauri::AppHandle,
    base_path: String,
    playset_id: String,
    mod_id: String,
    enabled: bool,
) -> Result<Playset, AppError> {
    manager::toggle_entry_enabled(&app_handle, &base_path, &playset_id, &mod_id, enabled)
}

#[tauri::command]
pub fn add_mod_to_playset(
    app_handle: tauri::AppHandle,
    base_path: String,
    playset_id: String,
    mod_id: String,
    display_name: String,
) -> Result<Playset, AppError> {
    manager::add_mod_to_playset(&app_handle, &base_path, &playset_id, &mod_id, &display_name)
}

#[tauri::command]
pub fn remove_mod_from_playset(
    app_handle: tauri::AppHandle,
    base_path: String,
    playset_id: String,
    mod_id: String,
) -> Result<Playset, AppError> {
    manager::remove_mod_from_playset(&app_handle, &base_path, &playset_id, &mod_id)
}

#[tauri::command]
pub fn reorder_playset_entries(
    app_handle: tauri::AppHandle,
    base_path: String,
    playset_id: String,
    ordered_mod_ids: Vec<String>,
) -> Result<Playset, AppError> {
    manager::reorder_playset_entries(&app_handle, &base_path, &playset_id, ordered_mod_ids)
}

#[tauri::command]
pub fn set_active_playset(
    app_handle: tauri::AppHandle,
    base_path: String,
    profile_path: String,
    playset_id: String,
) -> Result<(), AppError> {
    manager::set_active_playset(&app_handle, &base_path, &profile_path, &playset_id)
}

#[tauri::command]
pub fn apply_playset(
    app_handle: tauri::AppHandle,
    base_path: String,
    profile_path: String,
    playset_id: String,
) -> Result<DriftReport, AppError> {
    manager::apply_playset(&app_handle, &base_path, &profile_path, &playset_id)
}

#[tauri::command]
pub fn save_active_as_playset(
    app_handle: tauri::AppHandle,
    base_path: String,
    profile_path: String,
    name: String,
) -> Result<Playset, AppError> {
    manager::save_active_as_playset(&app_handle, &base_path, &profile_path, &name)
}

#[tauri::command]
pub fn accept_playset_drift(
    app_handle: tauri::AppHandle,
    base_path: String,
    profile_path: String,
    playset_id: String,
) -> Result<Playset, AppError> {
    manager::accept_playset_drift(&app_handle, &base_path, &profile_path, &playset_id)
}

#[tauri::command]
pub fn compute_playset_drift(
    app_handle: tauri::AppHandle,
    base_path: String,
    profile_path: String,
    playset_id: String,
) -> Result<DriftReport, AppError> {
    manager::compute_playset_drift(&app_handle, &base_path, &profile_path, &playset_id)
}

#[tauri::command]
pub fn export_playset(
    app_handle: tauri::AppHandle,
    base_path: String,
    playset_id: String,
    destination_path: String,
) -> Result<(), AppError> {
    io::export_playset(&app_handle, &base_path, &playset_id, &destination_path)
}

#[tauri::command]
pub fn import_playset(
    app_handle: tauri::AppHandle,
    base_path: String,
    source_path: String,
) -> Result<Playset, AppError> {
    io::import_playset(&app_handle, &base_path, &source_path)
}
