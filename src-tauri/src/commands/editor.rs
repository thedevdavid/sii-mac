use std::sync::Arc;

use tauri::State;

use crate::commands::run_blocking;
use crate::error::AppError;
use crate::save::cache::SaveCache;
use crate::save::models::{
    BulkAction, GarageChange, GarageData, PlayerChanges, SaveData, TrailerChanges, TrailerData,
    TruckChanges, TruckData,
};
use crate::save::writer;

/// Player-level mutations need bank + economy on the way back so the frontend
/// can patch its cache without refetching the whole save.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PlayerUpdateResult {
    pub player: crate::save::models::PlayerData,
    pub bank: crate::save::models::BankData,
    pub economy: crate::save::models::EconomyData,
}

#[tauri::command]
pub async fn get_save_data(
    cache: State<'_, Arc<SaveCache>>,
    save_path: String,
) -> Result<SaveData, AppError> {
    let cache = cache.inner().clone();
    run_blocking(move || {
        let snap = cache.get(&save_path)?;
        Ok((*snap).clone())
    })
    .await
}

#[tauri::command]
pub async fn update_player_data(
    cache: State<'_, Arc<SaveCache>>,
    save_path: String,
    changes: PlayerChanges,
) -> Result<PlayerUpdateResult, AppError> {
    let cache = cache.inner().clone();
    run_blocking(move || {
        writer::update_player(&save_path, &changes)?;
        let snap = cache.refresh(&save_path)?;
        Ok(PlayerUpdateResult {
            player: snap.player.clone(),
            bank: snap.bank.clone(),
            economy: snap.economy.clone(),
        })
    })
    .await
}

#[tauri::command]
pub async fn update_truck(
    cache: State<'_, Arc<SaveCache>>,
    save_path: String,
    truck_id: String,
    changes: TruckChanges,
) -> Result<TruckData, AppError> {
    let cache = cache.inner().clone();
    run_blocking(move || {
        writer::update_truck(&save_path, &truck_id, &changes)?;
        let snap = cache.refresh(&save_path)?;
        find_truck(&snap, &truck_id)
    })
    .await
}

#[tauri::command]
pub async fn update_all_trucks(
    cache: State<'_, Arc<SaveCache>>,
    save_path: String,
    action: BulkAction,
) -> Result<Vec<TruckData>, AppError> {
    let cache = cache.inner().clone();
    run_blocking(move || {
        writer::update_all_trucks(&save_path, &action)?;
        let snap = cache.refresh(&save_path)?;
        Ok(snap.trucks.clone())
    })
    .await
}

#[tauri::command]
pub async fn update_trailer(
    cache: State<'_, Arc<SaveCache>>,
    save_path: String,
    trailer_id: String,
    changes: TrailerChanges,
) -> Result<TrailerData, AppError> {
    let cache = cache.inner().clone();
    run_blocking(move || {
        writer::update_trailer(&save_path, &trailer_id, &changes)?;
        let snap = cache.refresh(&save_path)?;
        find_trailer(&snap, &trailer_id)
    })
    .await
}

#[tauri::command]
pub async fn repair_all_trailers(
    cache: State<'_, Arc<SaveCache>>,
    save_path: String,
) -> Result<Vec<TrailerData>, AppError> {
    let cache = cache.inner().clone();
    run_blocking(move || {
        writer::update_all_trailers(&save_path)?;
        let snap = cache.refresh(&save_path)?;
        Ok(snap.trailers.clone())
    })
    .await
}

#[tauri::command]
pub async fn update_garage(
    cache: State<'_, Arc<SaveCache>>,
    save_path: String,
    garage_id: String,
    change: GarageChange,
) -> Result<GarageData, AppError> {
    let cache = cache.inner().clone();
    run_blocking(move || {
        writer::update_garage(&save_path, &garage_id, &change)?;
        let snap = cache.refresh(&save_path)?;
        find_garage(&snap, &garage_id)
    })
    .await
}

#[tauri::command]
pub async fn unlock_all_garages(
    cache: State<'_, Arc<SaveCache>>,
    save_path: String,
) -> Result<Vec<GarageData>, AppError> {
    let cache = cache.inner().clone();
    run_blocking(move || {
        writer::unlock_all_garages(&save_path)?;
        let snap = cache.refresh(&save_path)?;
        Ok(snap.garages.clone())
    })
    .await
}

fn find_truck(snap: &Arc<SaveData>, id: &str) -> Result<TruckData, AppError> {
    snap.trucks
        .iter()
        .find(|t| t.id == id)
        .cloned()
        .ok_or_else(|| AppError::NotFound(format!("Truck not found after update: {id}")))
}

fn find_trailer(snap: &Arc<SaveData>, id: &str) -> Result<TrailerData, AppError> {
    snap.trailers
        .iter()
        .find(|t| t.id == id)
        .cloned()
        .ok_or_else(|| AppError::NotFound(format!("Trailer not found after update: {id}")))
}

fn find_garage(snap: &Arc<SaveData>, id: &str) -> Result<GarageData, AppError> {
    snap.garages
        .iter()
        .find(|g| g.id == id)
        .cloned()
        .ok_or_else(|| AppError::NotFound(format!("Garage not found after update: {id}")))
}
