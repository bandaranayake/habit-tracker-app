use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;

use crate::error::AppError;

/// Managed state: the live SQLite3MC (SQLCipher-format) connection, `None` while locked. The key never leaves Rust.
#[derive(Default)]
pub struct Db(pub Mutex<Option<Connection>>);

impl Db {
    /// Run `f` on the live connection, or fail with `AppError::Locked` if there is none.
    pub fn with_conn<T>(
        &self,
        f: impl FnOnce(&mut Connection) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        // A poisoned lock only means a previous holder panicked; the connection itself is still usable.
        let mut guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        match guard.as_mut() {
            Some(conn) => f(conn),
            None => Err(AppError::Locked),
        }
    }
}

/// Quote a passphrase as an SQL string literal. The derived key is base64 (no `'`); the escape is defense in depth.
fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// SQLite3MC defaults to ChaCha20; Electron used the SQLCipher format. Must precede key/rekey.
const CIPHER_PRAGMA: &str = "PRAGMA cipher = 'sqlcipher';";

/// Open (creating if missing) the DB at `path`, apply the key and pragmas, and check the key.
pub fn open_with_key(path: &Path, key: &str) -> Result<Connection, AppError> {
    let conn = Connection::open(path)?;
    conn.execute_batch(CIPHER_PRAGMA)?;
    conn.execute_batch(&format!("PRAGMA key = {};", quote(key)))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    // Fails with "file is not a database" when the key is wrong.
    conn.prepare("SELECT 1 FROM sqlite_master LIMIT 1")?
        .query([])?
        .next()?;
    Ok(conn)
}

/// Whether `key` opens the DB at `path`, using a separate temporary connection.
pub fn verify_key(path: &Path, key: &str) -> bool {
    open_with_key(path, key).is_ok()
}

/// Re-encrypt the open database with `new_key`.
pub fn rekey(conn: &Connection, new_key: &str) -> Result<(), AppError> {
    conn.execute_batch(CIPHER_PRAGMA)?;
    conn.execute_batch(&format!("PRAGMA rekey = {};", quote(new_key)))?;
    Ok(())
}

/// The full schema, verbatim from the Electron `initSchema`. Idempotent.
pub fn init_schema(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "
    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      status INTEGER NOT NULL,
      weight REAL DEFAULT 1.0,
      target_per_week INTEGER,
      sort_order INTEGER,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      completion_rate REAL DEFAULT 0.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS habit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      state INTEGER NOT NULL,
      status INTEGER NOT NULL,
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
      UNIQUE(habit_id, date)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  ",
    )?;

    // Backfill columns added after the initial CREATE TABLE (no migration system, by design).
    let columns = {
        let mut stmt = conn.prepare("PRAGMA table_info(habits)")?;
        let names = stmt
            .query_map([], |row| row.get::<_, String>("name"))?
            .collect::<Result<Vec<_>, _>>()?;
        names
    };
    for column in ["target_per_week", "sort_order"] {
        if !columns.iter().any(|c| c == column) {
            conn.execute_batch(&format!("ALTER TABLE habits ADD COLUMN {column} INTEGER;"))?;
        }
    }
    conn.execute_batch("UPDATE habits SET sort_order = id WHERE sort_order IS NULL;")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("database.sqlite");
        (dir, path)
    }

    fn table_names(conn: &Connection) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .unwrap();
        stmt.query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    #[test]
    fn create_then_reopen_with_right_key() {
        let (_dir, path) = temp_db();
        let conn = open_with_key(&path, "right-key").unwrap();
        init_schema(&conn).unwrap();
        conn.execute("INSERT INTO settings (key, value) VALUES ('a', 'b')", [])
            .unwrap();
        drop(conn);

        let conn = open_with_key(&path, "right-key").unwrap();
        let v: String = conn
            .query_row("SELECT value FROM settings WHERE key = 'a'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(v, "b");
    }

    #[test]
    fn wrong_key_fails() {
        let (_dir, path) = temp_db();
        init_schema(&open_with_key(&path, "right-key").unwrap()).unwrap();
        assert!(open_with_key(&path, "wrong-key").is_err());
        assert!(!verify_key(&path, "wrong-key"));
        assert!(verify_key(&path, "right-key"));
    }

    #[test]
    fn rekey_switches_key() {
        let (_dir, path) = temp_db();
        let conn = open_with_key(&path, "old-key").unwrap();
        init_schema(&conn).unwrap();
        rekey(&conn, "new'key").unwrap();
        drop(conn);

        assert!(open_with_key(&path, "new'key").is_ok());
        assert!(open_with_key(&path, "old-key").is_err());
    }

    #[test]
    fn init_schema_is_idempotent() {
        let (_dir, path) = temp_db();
        let conn = open_with_key(&path, "k").unwrap();
        init_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO habits (name, color, status) VALUES ('h', 'c', 1)",
            [],
        )
        .unwrap();
        init_schema(&conn).unwrap();

        for t in ["habit_logs", "habits", "settings"] {
            assert!(table_names(&conn).iter().any(|n| n == t), "missing {t}");
        }
        // Backfill set sort_order from id.
        let sort: i64 = conn
            .query_row("SELECT sort_order FROM habits WHERE name = 'h'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(sort, 1);
    }

    #[test]
    fn init_schema_adds_missing_columns() {
        let (_dir, path) = temp_db();
        let conn = open_with_key(&path, "k").unwrap();
        conn.execute_batch(
            "CREATE TABLE habits (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
             color TEXT NOT NULL, status INTEGER NOT NULL);
             INSERT INTO habits (name, color, status) VALUES ('h', 'c', 1);",
        )
        .unwrap();
        init_schema(&conn).unwrap();
        let (target, sort): (Option<i64>, i64) = conn
            .query_row("SELECT target_per_week, sort_order FROM habits", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!((target, sort), (None, 1));
    }

    #[test]
    fn foreign_keys_on() {
        let (_dir, path) = temp_db();
        let conn = open_with_key(&path, "k").unwrap();
        let fk: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fk, 1);
    }

    #[test]
    fn engine_is_sqlite3mc_with_sqlcipher_cipher() {
        let (_dir, path) = temp_db();
        let conn = open_with_key(&path, "k").unwrap();
        let version: String = conn
            .query_row("SELECT sqlite3mc_version()", [], |r| r.get(0))
            .unwrap();
        assert!(version.contains("SQLite3 Multiple Ciphers"), "{version}");
        let cipher: String = conn.query_row("PRAGMA cipher", [], |r| r.get(0)).unwrap();
        assert_eq!(cipher, "sqlcipher");
    }

    #[test]
    fn file_is_encrypted_at_rest() {
        let (_dir, path) = temp_db();
        let conn = open_with_key(&path, "k").unwrap();
        init_schema(&conn).unwrap();
        conn.execute("INSERT INTO settings (key, value) VALUES ('a', 'b')", [])
            .unwrap();
        drop(conn);

        let bytes = std::fs::read(&path).unwrap();
        assert!(bytes.len() >= 16);
        assert_ne!(&bytes[..16], b"SQLite format 3\0");
    }

    #[test]
    fn with_conn_locked_when_none() {
        let db = Db::default();
        assert!(matches!(db.with_conn(|_| Ok(())), Err(AppError::Locked)));
    }
}
