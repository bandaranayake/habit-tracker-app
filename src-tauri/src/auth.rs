//! Onboarding and auth commands (docs/ipc-contract.md, "Onboarding and auth").
//! Logic lives in plain fns over `&Paths`, `&Db` and `&FailedAttempts`; the commands are thin wrappers.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;

use base64::Engine;
use serde::Serialize;
use sha2::Sha256;
use tauri::{AppHandle, Manager, State};

use crate::db::{self, Db};
use crate::error::AppError;

const KDF_ITERATIONS: u32 = 100_000;
const KDF_KEY_LENGTH: usize = 32;
const SALT_LENGTH: usize = 32;
const MIN_PASSWORD_LENGTH: usize = 8;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Paths {
    pub salt: PathBuf,
    pub db: PathBuf,
}

impl Paths {
    pub fn in_dir(dir: &Path) -> Self {
        Paths {
            salt: dir.join(".salt"),
            db: dir.join("database.sqlite"),
        }
    }
}

/// `<config_dir>/habit-tracker-app`, or `-dev` in debug builds (Electron's userData split).
pub fn data_dir(config_dir: &Path, debug: bool) -> PathBuf {
    config_dir.join(if debug {
        "habit-tracker-app-dev"
    } else {
        "habit-tracker-app"
    })
}

/// In-memory brute-force throttle counter for unlock; 0 on every launch.
#[derive(Default)]
pub struct FailedAttempts(pub AtomicU32);

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct DbResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl DbResult {
    fn ok() -> Self {
        DbResult {
            success: true,
            error: None,
        }
    }
    fn err(msg: impl Into<String>) -> Self {
        DbResult {
            success: false,
            error: Some(msg.into()),
        }
    }
}

fn pbkdf2_b64(password: &str, salt: &[u8], rounds: u32) -> String {
    let mut key = [0u8; KDF_KEY_LENGTH];
    pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, rounds, &mut key);
    base64::engine::general_purpose::STANDARD.encode(key)
}

pub fn derive_key(password: &str, salt: &[u8]) -> String {
    pbkdf2_b64(password, salt, KDF_ITERATIONS)
}

fn new_salt() -> Result<[u8; SALT_LENGTH], AppError> {
    let mut salt = [0u8; SALT_LENGTH];
    getrandom::fill(&mut salt).map_err(std::io::Error::from)?;
    Ok(salt)
}

fn get_or_create_salt(path: &Path) -> Result<Vec<u8>, AppError> {
    if path.exists() {
        return Ok(std::fs::read(path)?);
    }
    let salt = new_salt()?;
    std::fs::write(path, salt)?;
    Ok(salt.to_vec())
}

pub fn throttle_delay_ms(failed: u32) -> u64 {
    u64::from(failed).saturating_mul(500).min(5000)
}

/// JS `string.length` semantics (UTF-16 code units).
fn too_short(password: &str) -> bool {
    password.encode_utf16().count() < MIN_PASSWORD_LENGTH
}

fn open_and_init(paths: &Paths, key: &str) -> Result<rusqlite::Connection, AppError> {
    let conn = db::open_with_key(&paths.db, key)?;
    db::init_schema(&conn)?;
    Ok(conn)
}

fn store(db: &Db, conn: rusqlite::Connection) {
    *db.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(conn);
}

pub fn create(paths: &Paths, db: &Db, failed: &FailedAttempts, password: &str) -> DbResult {
    if too_short(password) {
        return DbResult::err("Password must be at least 8 characters");
    }
    if paths.db.exists() {
        return DbResult::err("Database already exists");
    }
    let result = get_or_create_salt(&paths.salt)
        .and_then(|salt| open_and_init(paths, &derive_key(password, &salt)));
    match result {
        Ok(conn) => {
            store(db, conn);
            failed.0.store(0, Ordering::SeqCst);
            DbResult::ok()
        }
        Err(e) => DbResult::err(e.to_string()),
    }
}

/// Unlock steps 1-2. `Some` = reject before the throttle.
pub fn unlock_precheck(paths: &Paths, password: &str) -> Option<DbResult> {
    if !paths.db.exists() || !paths.salt.exists() {
        return Some(DbResult::err("Database does not exist"));
    }
    if password.is_empty() {
        return Some(DbResult::err("Password cannot be empty"));
    }
    None
}

/// Unlock steps 4-5 (blocking: PBKDF2 + SQLCipher KDF). Call after the throttle sleep.
pub fn unlock_attempt(paths: &Paths, db: &Db, failed: &FailedAttempts, password: &str) -> DbResult {
    let result = std::fs::read(&paths.salt)
        .map_err(AppError::from)
        .and_then(|salt| open_and_init(paths, &derive_key(password, &salt)));
    match result {
        Ok(conn) => {
            store(db, conn);
            failed.0.store(0, Ordering::SeqCst);
            DbResult::ok()
        }
        Err(_) => {
            failed.0.fetch_add(1, Ordering::SeqCst);
            DbResult::err("Incorrect password provided")
        }
    }
}

pub fn change(paths: &Paths, db: &Db, current_password: &str, new_password: &str) -> DbResult {
    if too_short(new_password) {
        return DbResult::err("New password must be at least 8 characters");
    }
    if current_password.is_empty() {
        return DbResult::err("Current password cannot be empty");
    }
    let result = (|| -> Result<DbResult, AppError> {
        let current_key = derive_key(current_password, &std::fs::read(&paths.salt)?);
        if !db::verify_key(&paths.db, &current_key) {
            return Ok(DbResult::err("Current password is incorrect"));
        }
        let salt = new_salt()?;
        let new_key = derive_key(new_password, &salt);
        db.with_conn(|conn| db::rekey(conn, &new_key))?;
        // Only replace the salt file once the rekey itself has succeeded.
        std::fs::write(&paths.salt, salt)?;
        Ok(DbResult::ok())
    })();
    result.unwrap_or_else(|e| DbResult::err(e.to_string()))
}

/// Run blocking auth work off the async worker; a join failure becomes a DbResult error.
async fn blocking(
    app: &AppHandle,
    f: impl FnOnce(&Paths, &Db, &FailedAttempts) -> DbResult + Send + 'static,
) -> DbResult {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        f(
            &app.state::<Paths>(),
            &app.state::<Db>(),
            &app.state::<FailedAttempts>(),
        )
    })
    .await
    .unwrap_or_else(|e| DbResult::err(e.to_string()))
}

#[tauri::command]
pub fn salt_exists(paths: State<'_, Paths>) -> Result<bool, AppError> {
    Ok(paths.salt.try_exists()?)
}

#[tauri::command]
pub fn db_exists(paths: State<'_, Paths>) -> Result<bool, AppError> {
    Ok(paths.db.try_exists()?)
}

#[tauri::command]
pub async fn create_database(app: AppHandle, password: String) -> Result<DbResult, AppError> {
    Ok(blocking(&app, move |p, db, f| create(p, db, f, &password)).await)
}

#[tauri::command]
pub async fn unlock_database(
    app: AppHandle,
    paths: State<'_, Paths>,
    failed: State<'_, FailedAttempts>,
    password: String,
) -> Result<DbResult, AppError> {
    if let Some(res) = unlock_precheck(&paths, &password) {
        return Ok(res);
    }
    let delay = throttle_delay_ms(failed.0.load(Ordering::SeqCst));
    if delay > 0 {
        tokio::time::sleep(Duration::from_millis(delay)).await;
    }
    Ok(blocking(&app, move |p, db, f| unlock_attempt(p, db, f, &password)).await)
}

#[tauri::command]
pub async fn change_password(
    app: AppHandle,
    current_password: String,
    new_password: String,
) -> Result<DbResult, AppError> {
    Ok(blocking(&app, move |p, db, _| {
        change(p, db, &current_password, &new_password)
    })
    .await)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    }

    #[test]
    fn pbkdf2_sha256_published_vectors() {
        // Widely published PBKDF2-HMAC-SHA256 vectors, P="password", S="salt", dkLen=32.
        let b64 = |h| base64::engine::general_purpose::STANDARD.encode(hex(h));
        assert_eq!(
            pbkdf2_b64("password", b"salt", 1),
            b64("120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b")
        );
        assert_eq!(
            pbkdf2_b64("password", b"salt", 4096),
            b64("c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a")
        );
    }

    #[test]
    fn derive_key_shape() {
        let key = derive_key("password", b"salt");
        assert_eq!(key.len(), 44); // 32 bytes, padded base64
        assert!(key.ends_with('='));
        assert_ne!(key, pbkdf2_b64("password", b"salt", 4096));
    }

    #[test]
    fn throttle_delays() {
        assert_eq!(throttle_delay_ms(0), 0);
        assert_eq!(throttle_delay_ms(1), 500);
        assert_eq!(throttle_delay_ms(10), 5000);
        assert_eq!(throttle_delay_ms(11), 5000);
        assert_eq!(throttle_delay_ms(u32::MAX), 5000);
    }

    #[test]
    fn length_counts_utf16_units() {
        assert!(!too_short("😀😀😀😀")); // 4 chars, 8 UTF-16 units
        assert!(too_short("1234567"));
        assert!(!too_short("12345678"));
    }

    #[test]
    fn data_dir_split() {
        let base = Path::new("cfg");
        assert_eq!(data_dir(base, true), base.join("habit-tracker-app-dev"));
        assert_eq!(data_dir(base, false), base.join("habit-tracker-app"));
        let p = Paths::in_dir(base);
        assert_eq!(p.salt, base.join(".salt"));
        assert_eq!(p.db, base.join("database.sqlite"));
    }

    #[test]
    fn db_result_omits_error_on_success() {
        assert_eq!(
            serde_json::to_value(DbResult::ok()).unwrap(),
            serde_json::json!({ "success": true })
        );
        assert_eq!(
            serde_json::to_value(DbResult::err("x")).unwrap(),
            serde_json::json!({ "success": false, "error": "x" })
        );
    }

    fn unlock(paths: &Paths, db: &Db, failed: &FailedAttempts, pw: &str) -> DbResult {
        unlock_precheck(paths, pw).unwrap_or_else(|| unlock_attempt(paths, db, failed, pw))
    }

    #[test]
    fn full_flow() {
        let dir = tempfile::tempdir().unwrap();
        let paths = Paths::in_dir(dir.path());
        let db = Db::default();
        let failed = FailedAttempts::default();
        let err = |m: &str| DbResult::err(m);

        // Missing files / empty password.
        assert_eq!(
            unlock(&paths, &db, &failed, "whatever1"),
            err("Database does not exist")
        );
        assert_eq!(
            change(&paths, &db, "", "newpassword"),
            err("Current password cannot be empty")
        );
        assert_eq!(
            change(&paths, &db, "x", "short"),
            err("New password must be at least 8 characters")
        );

        // Create.
        assert_eq!(
            create(&paths, &db, &failed, "short"),
            err("Password must be at least 8 characters")
        );
        assert_eq!(create(&paths, &db, &failed, "password1"), DbResult::ok());
        assert!(db.0.lock().unwrap().is_some());
        assert_eq!(
            create(&paths, &db, &failed, "password1"),
            err("Database already exists")
        );
        assert_eq!(
            unlock(&paths, &db, &failed, ""),
            err("Password cannot be empty")
        );

        // Unlock + throttle counter.
        assert_eq!(
            unlock(&paths, &db, &failed, "wrongpass"),
            err("Incorrect password provided")
        );
        assert_eq!(failed.0.load(Ordering::SeqCst), 1);
        assert!(db.0.lock().unwrap().is_some(), "failure keeps connection");
        assert_eq!(unlock(&paths, &db, &failed, "password1"), DbResult::ok());
        assert_eq!(failed.0.load(Ordering::SeqCst), 0);

        // Change password.
        assert_eq!(
            change(&paths, &db, "wrongpass", "newpassword"),
            err("Current password is incorrect")
        );
        let old_salt = std::fs::read(&paths.salt).unwrap();
        assert_eq!(old_salt.len(), SALT_LENGTH);
        assert_eq!(
            change(&paths, &db, "password1", "newpassword"),
            DbResult::ok()
        );
        assert_ne!(std::fs::read(&paths.salt).unwrap(), old_salt);
        assert_eq!(unlock(&paths, &db, &failed, "newpassword"), DbResult::ok());
        assert_eq!(
            unlock(&paths, &db, &failed, "password1"),
            err("Incorrect password provided")
        );

        // No live connection -> locked.
        let fresh = Db::default();
        assert_eq!(
            change(&paths, &fresh, "newpassword", "another123"),
            err("Database is locked")
        );
    }
}
