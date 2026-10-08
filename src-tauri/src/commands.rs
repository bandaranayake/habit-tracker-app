//! Data commands (habits, habit logs, settings). See docs/ipc-contract.md.
//! The SQL lives in plain fns over `&Connection` so it is unit-testable; commands are thin wrappers.

use std::collections::HashMap;

use rusqlite::{params, Connection, Row};
use serde::Serialize;
use tauri::State;

use crate::db::Db;
use crate::error::AppError;

#[derive(Debug, Serialize, PartialEq)]
pub struct Habit {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub status: i64,
    pub weight: f64,
    pub target_per_week: Option<i64>,
    pub sort_order: i64,
    pub current_streak: i64,
    pub longest_streak: i64,
    pub completion_rate: f64,
    pub created_at: String,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct HabitLog {
    pub id: i64,
    pub habit_id: i64,
    pub date: String,
    pub state: i64,
    pub status: i64,
}

// rusqlite's `f64` FromSql accepts both INTEGER and REAL storage, so `weight` / `completion_rate`
// read fine whatever numeric type SQLite stored.
fn habit_from_row(row: &Row) -> rusqlite::Result<Habit> {
    Ok(Habit {
        id: row.get("id")?,
        name: row.get("name")?,
        color: row.get("color")?,
        status: row.get("status")?,
        weight: row.get("weight")?,
        target_per_week: row.get("target_per_week")?,
        sort_order: row.get("sort_order")?,
        current_streak: row.get("current_streak")?,
        longest_streak: row.get("longest_streak")?,
        completion_rate: row.get("completion_rate")?,
        created_at: row.get("created_at")?,
    })
}

fn log_from_row(row: &Row) -> rusqlite::Result<HabitLog> {
    Ok(HabitLog {
        id: row.get("id")?,
        habit_id: row.get("habit_id")?,
        date: row.get("date")?,
        state: row.get("state")?,
        status: row.get("status")?,
    })
}

pub fn q_get_all_habits(conn: &Connection) -> Result<Vec<Habit>, AppError> {
    let mut stmt = conn
        .prepare("SELECT * FROM habits WHERE status IN (1, 2) ORDER BY sort_order ASC, id ASC")?;
    let rows = stmt.query_map([], habit_from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn q_get_all_habit_logs(conn: &Connection) -> Result<Vec<HabitLog>, AppError> {
    let mut stmt = conn.prepare("SELECT * FROM habit_logs WHERE status = 1")?;
    let rows = stmt.query_map([], log_from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn q_add_habit(conn: &Connection, name: &str, color: &str) -> Result<i64, AppError> {
    let next: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM habits",
        [],
        |r| r.get(0),
    )?;
    conn.execute(
        "INSERT INTO habits (name, color, status, sort_order) VALUES (?, ?, 1, ?)",
        params![name, color, next],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn q_update_habit(
    conn: &Connection,
    habit_id: i64,
    current_streak: i64,
    longest_streak: i64,
    completion_rate: f64,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE habits SET current_streak = ?, longest_streak = ?, completion_rate = ? WHERE id = ?",
        params![current_streak, longest_streak, completion_rate, habit_id],
    )?;
    Ok(())
}

pub fn q_set_habit_weight(conn: &Connection, habit_id: i64, weight: f64) -> Result<(), AppError> {
    conn.execute(
        "UPDATE habits SET weight = ? WHERE id = ?",
        params![weight, habit_id],
    )?;
    Ok(())
}

pub fn q_set_habit_target(
    conn: &Connection,
    habit_id: i64,
    target_per_week: Option<i64>,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE habits SET target_per_week = ? WHERE id = ?",
        params![target_per_week, habit_id],
    )?;
    Ok(())
}

pub fn q_update_habit_details(
    conn: &Connection,
    habit_id: i64,
    name: &str,
    color: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE habits SET name = ?, color = ? WHERE id = ?",
        params![name, color, habit_id],
    )?;
    Ok(())
}

pub fn q_update_habit_log(
    conn: &Connection,
    habit_id: i64,
    date: &str,
    state: i64,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO habit_logs (habit_id, date, state, status) VALUES (?, ?, ?, 1) \
         ON CONFLICT(habit_id, date) DO UPDATE SET state = excluded.state, status = 1",
        params![habit_id, date, state],
    )?;
    Ok(())
}

pub fn q_remove_habit(conn: &mut Connection, habit_id: i64) -> Result<(), AppError> {
    let tx = conn.transaction()?;
    tx.execute("UPDATE habits SET status = 0 WHERE id = ?", [habit_id])?;
    tx.execute(
        "UPDATE habit_logs SET status = 0 WHERE habit_id = ?",
        [habit_id],
    )?;
    tx.commit()?;
    Ok(())
}

pub fn q_reorder_habits(conn: &mut Connection, ordered_ids: &[i64]) -> Result<(), AppError> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare("UPDATE habits SET sort_order = ? WHERE id = ?")?;
        for (index, id) in ordered_ids.iter().enumerate() {
            stmt.execute(params![index as i64, id])?;
        }
    }
    tx.commit()?;
    Ok(())
}

pub fn q_set_habit_status(conn: &Connection, habit_id: i64, status: i64) -> Result<(), AppError> {
    conn.execute(
        "UPDATE habits SET status = ? WHERE id = ?",
        params![status, habit_id],
    )?;
    Ok(())
}

pub fn q_get_all_settings(conn: &Connection) -> Result<HashMap<String, String>, AppError> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |r| Ok((r.get("key")?, r.get("value")?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn q_set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

#[tauri::command]
pub fn get_all_habits(db: State<'_, Db>) -> Result<Vec<Habit>, AppError> {
    db.with_conn(|c| q_get_all_habits(c))
}

#[tauri::command]
pub fn get_all_habit_logs(db: State<'_, Db>) -> Result<Vec<HabitLog>, AppError> {
    db.with_conn(|c| q_get_all_habit_logs(c))
}

#[tauri::command]
pub fn add_habit(db: State<'_, Db>, name: String, color: String) -> Result<i64, AppError> {
    db.with_conn(|c| q_add_habit(c, &name, &color))
}

#[tauri::command]
pub fn update_habit(
    db: State<'_, Db>,
    habit_id: i64,
    current_streak: i64,
    longest_streak: i64,
    completion_rate: f64,
) -> Result<(), AppError> {
    db.with_conn(|c| q_update_habit(c, habit_id, current_streak, longest_streak, completion_rate))
}

#[tauri::command]
pub fn set_habit_weight(db: State<'_, Db>, habit_id: i64, weight: f64) -> Result<(), AppError> {
    db.with_conn(|c| q_set_habit_weight(c, habit_id, weight))
}

#[tauri::command]
pub fn set_habit_target(
    db: State<'_, Db>,
    habit_id: i64,
    target_per_week: Option<i64>,
) -> Result<(), AppError> {
    db.with_conn(|c| q_set_habit_target(c, habit_id, target_per_week))
}

#[tauri::command]
pub fn update_habit_details(
    db: State<'_, Db>,
    habit_id: i64,
    name: String,
    color: String,
) -> Result<(), AppError> {
    db.with_conn(|c| q_update_habit_details(c, habit_id, &name, &color))
}

#[tauri::command]
pub fn update_habit_log(
    db: State<'_, Db>,
    habit_id: i64,
    date: String,
    state: i64,
) -> Result<(), AppError> {
    db.with_conn(|c| q_update_habit_log(c, habit_id, &date, state))
}

#[tauri::command]
pub fn remove_habit(db: State<'_, Db>, habit_id: i64) -> Result<(), AppError> {
    db.with_conn(|c| q_remove_habit(c, habit_id))
}

#[tauri::command]
pub fn reorder_habits(db: State<'_, Db>, ordered_ids: Vec<i64>) -> Result<(), AppError> {
    db.with_conn(|c| q_reorder_habits(c, &ordered_ids))
}

#[tauri::command]
pub fn archive_habit(db: State<'_, Db>, habit_id: i64) -> Result<(), AppError> {
    db.with_conn(|c| q_set_habit_status(c, habit_id, 2))
}

#[tauri::command]
pub fn unarchive_habit(db: State<'_, Db>, habit_id: i64) -> Result<(), AppError> {
    db.with_conn(|c| q_set_habit_status(c, habit_id, 1))
}

#[tauri::command]
pub fn get_all_settings(db: State<'_, Db>) -> Result<HashMap<String, String>, AppError> {
    db.with_conn(|c| q_get_all_settings(c))
}

#[tauri::command]
pub fn set_setting(db: State<'_, Db>, key: String, value: String) -> Result<(), AppError> {
    db.with_conn(|c| q_set_setting(c, &key, &value))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_schema, open_with_key};

    fn temp_conn() -> (tempfile::TempDir, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let conn = open_with_key(&dir.path().join("database.sqlite"), "k").unwrap();
        init_schema(&conn).unwrap();
        (dir, conn)
    }

    fn ids(conn: &Connection) -> Vec<i64> {
        q_get_all_habits(conn)
            .unwrap()
            .iter()
            .map(|h| h.id)
            .collect()
    }

    #[test]
    fn add_habit_increments_id_and_sort_order() {
        let (_d, conn) = temp_conn();
        let a = q_add_habit(&conn, "a", "red").unwrap();
        let b = q_add_habit(&conn, "b", "blue").unwrap();
        assert!(b > a);
        let habits = q_get_all_habits(&conn).unwrap();
        assert_eq!(
            habits.iter().map(|h| h.sort_order).collect::<Vec<_>>(),
            [1, 2]
        );
        let h = &habits[0];
        assert_eq!((h.status, h.weight, h.target_per_week), (1, 1.0, None));
        assert_eq!((h.current_streak, h.longest_streak), (0, 0));
        assert_eq!(h.completion_rate, 0.0);
        assert_eq!(h.created_at.len(), "YYYY-MM-DD HH:MM:SS".len());
    }

    #[test]
    fn get_all_habits_filters_and_orders() {
        let (_d, mut conn) = temp_conn();
        let a = q_add_habit(&conn, "a", "c").unwrap();
        let b = q_add_habit(&conn, "b", "c").unwrap();
        let c = q_add_habit(&conn, "c", "c").unwrap();
        let d = q_add_habit(&conn, "d", "c").unwrap();
        q_remove_habit(&mut conn, b).unwrap();
        q_set_habit_status(&conn, c, 2).unwrap();
        // Tie on sort_order -> id ASC.
        conn.execute("UPDATE habits SET sort_order = 0", [])
            .unwrap();
        assert_eq!(ids(&conn), [a, c, d]);
        conn.execute("UPDATE habits SET sort_order = 5 WHERE id = ?", [a])
            .unwrap();
        assert_eq!(ids(&conn), [c, d, a]);
    }

    #[test]
    fn remove_habit_soft_deletes_habit_and_logs() {
        let (_d, mut conn) = temp_conn();
        let a = q_add_habit(&conn, "a", "c").unwrap();
        let b = q_add_habit(&conn, "b", "c").unwrap();
        q_update_habit_log(&conn, a, "2026-01-01", 1).unwrap();
        q_update_habit_log(&conn, b, "2026-01-01", 1).unwrap();
        q_remove_habit(&mut conn, a).unwrap();
        let status: i64 = conn
            .query_row("SELECT status FROM habits WHERE id = ?", [a], |r| r.get(0))
            .unwrap();
        assert_eq!(status, 0);
        let logs = q_get_all_habit_logs(&conn).unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].habit_id, b);
    }

    #[test]
    fn update_habit_log_upserts_and_reactivates() {
        let (_d, mut conn) = temp_conn();
        let a = q_add_habit(&conn, "a", "c").unwrap();
        q_update_habit_log(&conn, a, "2026-01-01", 1).unwrap();
        q_update_habit_log(&conn, a, "2026-01-01", 2).unwrap();
        let logs = q_get_all_habit_logs(&conn).unwrap();
        assert_eq!(logs.len(), 1);
        let first_id = logs[0].id;
        assert_eq!((logs[0].state, logs[0].status), (2, 1));

        q_remove_habit(&mut conn, a).unwrap();
        assert!(q_get_all_habit_logs(&conn).unwrap().is_empty());
        q_update_habit_log(&conn, a, "2026-01-01", 3).unwrap();
        assert_eq!(
            q_get_all_habit_logs(&conn).unwrap(),
            [HabitLog {
                id: first_id,
                habit_id: a,
                date: "2026-01-01".into(),
                state: 3,
                status: 1
            }]
        );
    }

    #[test]
    fn reorder_habits_is_zero_based_in_given_order() {
        let (_d, mut conn) = temp_conn();
        let a = q_add_habit(&conn, "a", "c").unwrap();
        let b = q_add_habit(&conn, "b", "c").unwrap();
        let c = q_add_habit(&conn, "c", "c").unwrap();
        q_reorder_habits(&mut conn, &[c, a, b]).unwrap();
        let habits = q_get_all_habits(&conn).unwrap();
        let got: Vec<_> = habits.iter().map(|h| (h.id, h.sort_order)).collect();
        assert_eq!(got, [(c, 0), (a, 1), (b, 2)]);
    }

    #[test]
    fn archive_and_unarchive_leave_logs() {
        let (_d, conn) = temp_conn();
        let a = q_add_habit(&conn, "a", "c").unwrap();
        q_update_habit_log(&conn, a, "2026-01-01", 1).unwrap();
        q_set_habit_status(&conn, a, 2).unwrap();
        assert_eq!(q_get_all_habits(&conn).unwrap()[0].status, 2);
        assert_eq!(q_get_all_habit_logs(&conn).unwrap().len(), 1);
        q_set_habit_status(&conn, a, 1).unwrap();
        assert_eq!(q_get_all_habits(&conn).unwrap()[0].status, 1);
        assert_eq!(q_get_all_habit_logs(&conn).unwrap().len(), 1);
    }

    #[test]
    fn settings_upsert_and_map() {
        let (_d, conn) = temp_conn();
        q_set_setting(&conn, "theme", "dark").unwrap();
        q_set_setting(&conn, "lang", "en").unwrap();
        q_set_setting(&conn, "theme", "light").unwrap();
        let map = q_get_all_settings(&conn).unwrap();
        assert_eq!(
            map,
            HashMap::from([
                ("theme".to_string(), "light".to_string()),
                ("lang".to_string(), "en".to_string())
            ])
        );
    }

    #[test]
    fn target_none_is_null_and_details_update() {
        let (_d, conn) = temp_conn();
        let a = q_add_habit(&conn, "a", "c").unwrap();
        q_set_habit_target(&conn, a, Some(3)).unwrap();
        assert_eq!(q_get_all_habits(&conn).unwrap()[0].target_per_week, Some(3));
        q_set_habit_target(&conn, a, None).unwrap();
        let is_null: bool = conn
            .query_row(
                "SELECT target_per_week IS NULL FROM habits WHERE id = ?",
                [a],
                |r| r.get(0),
            )
            .unwrap();
        assert!(is_null);
        assert_eq!(q_get_all_habits(&conn).unwrap()[0].target_per_week, None);
        q_update_habit_details(&conn, a, "new", "blue").unwrap();
        let h = &q_get_all_habits(&conn).unwrap()[0];
        assert_eq!((h.name.as_str(), h.color.as_str()), ("new", "blue"));
    }

    #[test]
    fn numeric_columns_read_back_whatever_storage() {
        let (_d, conn) = temp_conn();
        let a = q_add_habit(&conn, "a", "c").unwrap();
        q_update_habit(&conn, a, 3, 7, 50.0).unwrap();
        q_set_habit_weight(&conn, a, 2.0).unwrap();
        let h = &q_get_all_habits(&conn).unwrap()[0];
        assert_eq!((h.current_streak, h.longest_streak), (3, 7));
        assert_eq!((h.completion_rate, h.weight), (50.0, 2.0));
        q_update_habit(&conn, a, 0, 7, 33.5).unwrap();
        q_set_habit_weight(&conn, a, 0.25).unwrap();
        let h = &q_get_all_habits(&conn).unwrap()[0];
        assert_eq!((h.completion_rate, h.weight), (33.5, 0.25));
        // Integer storage in a REAL column (e.g. a legacy table without the affinity) still reads as f64.
        let v: f64 = conn.query_row("SELECT 5", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 5.0);
    }

    #[test]
    fn locked_db_returns_locked() {
        let db = Db::default();
        assert!(matches!(
            db.with_conn(|c| q_get_all_habits(c)),
            Err(AppError::Locked)
        ));
        assert!(matches!(
            db.with_conn(|c| q_set_setting(c, "k", "v")),
            Err(AppError::Locked)
        ));
    }

    #[test]
    fn habit_serializes_with_snake_case_keys() {
        let (_d, conn) = temp_conn();
        q_add_habit(&conn, "a", "c").unwrap();
        let json = serde_json::to_value(&q_get_all_habits(&conn).unwrap()[0]).unwrap();
        let mut keys: Vec<_> = json.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(
            keys,
            [
                "color",
                "completion_rate",
                "created_at",
                "current_streak",
                "id",
                "longest_streak",
                "name",
                "sort_order",
                "status",
                "target_per_week",
                "weight"
            ]
        );
        assert!(json["target_per_week"].is_null());
    }
}
