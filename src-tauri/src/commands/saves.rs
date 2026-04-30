use crate::error::AppError;
use crate::profile::manager;
use crate::profile::models::SaveSummary;

#[tauri::command]
pub fn list_saves(profile_path: String) -> Result<Vec<SaveSummary>, AppError> {
    manager::list_saves_in_profile(&profile_path)
}
