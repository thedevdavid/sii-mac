use crate::error::AppError;
use crate::profile::detection;
use crate::profile::manager;
use crate::profile::models::{CloneOptions, GameInstallation, ProfileDetail, ProfileSummary};

#[tauri::command]
pub fn detect_game_installations() -> Result<Vec<GameInstallation>, AppError> {
    detection::detect_installations()
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
pub fn clone_profile(
    source_path: String,
    new_name: String,
    options: Option<CloneOptions>,
) -> Result<ProfileSummary, AppError> {
    let opts = options.unwrap_or_default();
    manager::clone_profile(&source_path, &new_name, &opts)
}

#[tauri::command]
pub fn rename_profile(profile_path: String, new_name: String) -> Result<ProfileSummary, AppError> {
    manager::rename_profile(&profile_path, &new_name)
}

#[tauri::command]
pub fn delete_profile(profile_path: String) -> Result<(), AppError> {
    manager::delete_profile(&profile_path)
}
