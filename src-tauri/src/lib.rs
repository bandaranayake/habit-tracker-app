pub mod db;
pub mod error;

pub fn run() {
    if let Err(err) = tauri::Builder::default()
        .manage(db::Db::default())
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
    {
        eprintln!("error while running tauri application: {err}");
        std::process::exit(1);
    }
}
