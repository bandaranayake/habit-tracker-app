pub mod auth;
pub mod db;
pub mod error;

use tauri::Manager;

pub fn run() {
    if let Err(err) = tauri::Builder::default()
        .manage(db::Db::default())
        .manage(auth::FailedAttempts::default())
        .setup(|app| {
            let dir = auth::data_dir(&app.path().config_dir()?, cfg!(debug_assertions));
            std::fs::create_dir_all(&dir)?;
            app.manage(auth::Paths::in_dir(&dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth::salt_exists,
            auth::db_exists,
            auth::create_database,
            auth::unlock_database,
            auth::change_password
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("error while running tauri application: {err}");
        std::process::exit(1);
    }
}
