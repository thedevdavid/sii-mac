mod commands;
mod error;
mod playset;
mod profile;
mod progress;
mod save;
mod sii;
mod steam;
pub mod utils;

#[tauri::command]
fn set_native_vibrancy(window: tauri::Window, enabled: bool) -> Result<(), error::AppError> {
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, clear_vibrancy, NSVisualEffectMaterial};
        if enabled {
            apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None).map_err(|e| {
                error::AppError::Io(std::io::Error::other(format!(
                    "apply_vibrancy failed: {e:?}"
                )))
            })?;
        } else {
            clear_vibrancy(&window).map_err(|e| {
                error::AppError::Io(std::io::Error::other(format!(
                    "clear_vibrancy failed: {e:?}"
                )))
            })?;
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        let _ = enabled;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .manage(progress::CancelRegistry::default())
        .invoke_handler(tauri::generate_handler![
            commands::profiles::detect_game_installations,
            commands::profiles::add_custom_game_path,
            commands::profiles::remove_custom_game_path,
            commands::profiles::scan_installation_mods,
            commands::profiles::refresh_installation_mods,
            commands::profiles::delete_local_mod,
            commands::playsets::list_playsets,
            commands::playsets::get_playset,
            commands::playsets::get_active_playset,
            commands::playsets::create_playset,
            commands::playsets::duplicate_playset,
            commands::playsets::rename_playset,
            commands::playsets::delete_playset,
            commands::playsets::update_playset_metadata,
            commands::playsets::set_playset_entries,
            commands::playsets::toggle_entry_enabled,
            commands::playsets::add_mod_to_playset,
            commands::playsets::remove_mod_from_playset,
            commands::playsets::reorder_playset_entries,
            commands::playsets::set_active_playset,
            commands::playsets::apply_playset,
            commands::playsets::save_active_as_playset,
            commands::playsets::accept_playset_drift,
            commands::playsets::compute_playset_drift,
            commands::playsets::export_playset,
            commands::playsets::import_playset,
            commands::workshop::fetch_workshop_metadata,
            commands::workshop::clear_workshop_metadata_cache,
            commands::profiles::list_profiles,
            commands::profiles::get_profile_detail,
            commands::profiles::scan_profile_contents,
            commands::profiles::clone_profile,
            commands::profiles::rename_profile,
            commands::profiles::delete_profile,
            commands::saves::list_saves,
            commands::backup::backup_profile,
            commands::backup::list_backups,
            commands::backup::restore_backup,
            commands::editor::get_save_data,
            commands::editor::update_player_data,
            commands::editor::update_truck,
            commands::editor::update_all_trucks,
            commands::editor::update_trailer,
            commands::editor::repair_all_trailers,
            commands::editor::update_garage,
            commands::editor::unlock_all_garages,
            commands::config::get_game_config,
            commands::config::update_game_config,
            progress::cancel_job,
            set_native_vibrancy,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
