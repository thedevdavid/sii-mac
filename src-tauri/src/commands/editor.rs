use crate::error::AppError;
use crate::save::models::*;
use crate::save::reader;
use crate::save::writer;

#[tauri::command]
pub fn get_save_data(save_path: String) -> Result<SaveData, AppError> {
    reader::read_save(&save_path)
}

#[tauri::command]
pub fn update_player_data(save_path: String, changes: PlayerChanges) -> Result<(), AppError> {
    writer::update_player(&save_path, &changes)
}

#[tauri::command]
pub fn update_truck(
    save_path: String,
    truck_id: String,
    changes: TruckChanges,
) -> Result<(), AppError> {
    writer::update_truck(&save_path, &truck_id, &changes)
}

#[tauri::command]
pub fn update_all_trucks(save_path: String, action: BulkAction) -> Result<usize, AppError> {
    writer::update_all_trucks(&save_path, &action)
}

#[tauri::command]
pub fn update_trailer(
    save_path: String,
    trailer_id: String,
    changes: TrailerChanges,
) -> Result<(), AppError> {
    writer::update_trailer(&save_path, &trailer_id, &changes)
}

#[tauri::command]
pub fn repair_all_trailers(save_path: String) -> Result<usize, AppError> {
    writer::update_all_trailers(&save_path)
}

#[tauri::command]
pub fn update_garage(
    save_path: String,
    garage_id: String,
    change: GarageChange,
) -> Result<(), AppError> {
    writer::update_garage(&save_path, &garage_id, &change)
}

#[tauri::command]
pub fn unlock_all_garages(save_path: String) -> Result<usize, AppError> {
    writer::unlock_all_garages(&save_path)
}
