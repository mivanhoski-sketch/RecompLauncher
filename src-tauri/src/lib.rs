mod commands;
mod store;

use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            app.manage(Mutex::new(store::Store::load(data_dir)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::save_settings,
            commands::load_catalog,
            commands::latest_release,
            commands::install_game,
            commands::uninstall_game,
            commands::set_game_files,
            commands::build_game,
            commands::launch_game,
            commands::open_game_dir,
            commands::list_config_files,
            commands::read_game_file,
            commands::write_game_file,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Recomp Launcher");
}
