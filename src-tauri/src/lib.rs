mod commands;
mod error;
mod profile;
mod sii;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::profiles::detect_game_installations,
            commands::profiles::list_profiles,
            commands::profiles::get_profile_detail,
            commands::profiles::clone_profile,
            commands::profiles::rename_profile,
            commands::profiles::delete_profile,
            commands::saves::list_saves,
            commands::backup::backup_profile,
            commands::backup::list_backups,
            commands::backup::restore_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
