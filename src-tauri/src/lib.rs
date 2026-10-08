pub mod auth;
pub mod commands;
pub mod db;
pub mod error;

use tauri::webview::NewWindowResponse;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

/// Only http(s) links leave the app (contract: "Native behavior").
fn is_external_web_url(url: &tauri::Url) -> bool {
    matches!(url.scheme(), "http" | "https")
}

pub fn run() {
    if let Err(err) = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(db::Db::default())
        .manage(auth::FailedAttempts::default())
        .setup(|app| {
            let dir = auth::data_dir(&app.path().config_dir()?, cfg!(debug_assertions));
            std::fs::create_dir_all(&dir)?;
            app.manage(auth::Paths::in_dir(&dir));

            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .cloned()
                .ok_or("window `main` missing from tauri.conf.json")?;
            let handle = app.handle().clone();
            let _window = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?
                .on_new_window(move |url, _features| {
                    if is_external_web_url(&url) {
                        if let Err(err) = handle.opener().open_url(url.as_str(), None::<&str>) {
                            eprintln!("failed to open external url: {err}");
                        }
                    }
                    NewWindowResponse::Deny
                })
                .build()?;
            #[cfg(debug_assertions)]
            _window.open_devtools();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth::salt_exists,
            auth::db_exists,
            auth::create_database,
            auth::unlock_database,
            auth::change_password,
            commands::get_all_habits,
            commands::get_all_habit_logs,
            commands::add_habit,
            commands::update_habit,
            commands::set_habit_weight,
            commands::set_habit_target,
            commands::update_habit_details,
            commands::update_habit_log,
            commands::remove_habit,
            commands::reorder_habits,
            commands::archive_habit,
            commands::unarchive_habit,
            commands::get_all_settings,
            commands::set_setting
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("error while running tauri application: {err}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::is_external_web_url;

    fn check(url: &str) -> bool {
        is_external_web_url(&tauri::Url::parse(url).expect("valid test url"))
    }

    #[test]
    fn web_schemes_are_external() {
        assert!(check("https://example.com/a?b=c"));
        assert!(check("http://example.com"));
    }

    #[test]
    fn other_schemes_are_ignored() {
        for url in [
            "file:///C:/Windows/system32/calc.exe",
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "tauri://localhost/index.html",
            "ftp://example.com/file",
            "mailto:someone@example.com",
        ] {
            assert!(!check(url), "{url} must not be opened");
        }
    }
}
