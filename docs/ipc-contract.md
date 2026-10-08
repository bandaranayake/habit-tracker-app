# IPC contract

The only interface between `src-tauri/` (rust-dev) and the frontend (frontend-dev).
**Only the `lead` edits this file.** Workers report contract problems instead of working around them.

Derived 1:1 from `src/preload/index.ts` / `index.d.ts` and the handlers in `src/main/index.ts` (Electron, commit `857f825`).

## Conventions

- Command names are `snake_case`. JS calls them via `invoke('<name>', { camelCaseArgs })`, and Rust receives `snake_case` params (Tauri's default renaming; do not use `rename_all`).
- Every command returns `Result<T, AppError>`. On error, the JS promise rejects with the serialized `AppError`, which is a plain object and **not** an `Error` instance.
- Types are given on the TS side. Rust types must serialize to the same JSON shape. Field names in returned rows are `snake_case`, exactly the DB column names.
- TS `number` maps to Rust `i64` for ids, counts, `state`, streaks, `sort_order` and `target_per_week`, and to `f64` for `weight` and `completion_rate`.
- The frontend exposes these through `src/renderer/src/lib/native.ts` as `habitAPI.<camelCaseMethod>(...positional args)`, with the same names and signatures as the old `window.habitAPI` (column 1 below).

## Error type

```ts
export type AppErrorKind = 'Locked' | 'Database' | 'Io'

export interface AppError {
  kind: AppErrorKind
  message: string // human-readable, for console.error / display
}
```

| Variant    | When                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `Locked`   | A data command is called before `create_database` / `unlock_database` succeeded (no open connection). Message: `Database is locked`. |
| `Database` | Any `rusqlite` error.                                                                                                                |
| `Io`       | Filesystem error (salt file, data dir).                                                                                              |

Rust: `#[derive(thiserror::Error, Debug)] enum AppError { Locked, Database(rusqlite::Error), Io(std::io::Error) }` with a manual `Serialize` producing `{ "kind": "<Variant>", "message": "<Display>" }`.

## Shared types

```ts
export interface DbResult {
  success: boolean
  error?: string // omitted (not null) when success is true
}

// get_all_habits row: every column of `habits` (SELECT *)
export interface Habit {
  id: number
  name: string
  color: string
  status: number // 1 active, 2 archived (0 = deleted is never returned)
  weight: number
  target_per_week: number | null // null = daily habit
  sort_order: number
  current_streak: number
  longest_streak: number
  completion_rate: number
  created_at: string // SQLite CURRENT_TIMESTAMP text, 'YYYY-MM-DD HH:MM:SS' (UTC)
}

// get_all_habit_logs row: every column of `habit_logs` (SELECT *)
export interface HabitLog {
  id: number
  habit_id: number
  date: string
  state: number
  status: number // always 1 in results; the renderer interface may omit it
}
```

The renderer interfaces in `src/renderer/src/interfaces/` stay as they are. Extra JSON fields are fine.

## Commands

### Onboarding and auth (DbResult commands)

These commands **never reject for expected failures**. They resolve with `DbResult` carrying the exact message strings below. Rust: `async fn ... -> Result<DbResult, AppError>`. Return `Err` only if something outside these cases fails before a `DbResult` can be produced. Unexpected errors inside the `try` blocks become `{ success: false, error: <error Display> }`, as in Electron.

| Command           | Args (JS)                                          | Returns    | Replaces          |
| ----------------- | -------------------------------------------------- | ---------- | ----------------- |
| `salt_exists`     | none                                               | `boolean`  | `salt-exists`     |
| `db_exists`       | none                                               | `boolean`  | `db-exists`       |
| `create_database` | `{ password: string }`                             | `DbResult` | `create-database` |
| `unlock_database` | `{ password: string }`                             | `DbResult` | `unlock-database` |
| `change_password` | `{ currentPassword: string, newPassword: string }` | `DbResult` | `change-password` |

Shared constants: `KDF_ITERATIONS = 100_000`, `KDF_KEY_LENGTH = 32`, `SALT_LENGTH = 32`, `MIN_PASSWORD_LENGTH = 8` (counted in **UTF-16 code units** like JS `length`, i.e. `password.encode_utf16().count()`).
`derive_key(password, salt) = base64_standard_padded(pbkdf2_hmac_sha256(password_utf8, salt, 100_000, 32))`.
Files: `<data_dir>/.salt` (raw 32 bytes) and `<data_dir>/database.sqlite`, where `data_dir = config_dir()/habit-tracker-app` (release) or `config_dir()/habit-tracker-app-dev` (debug). Create the directory if it's missing.
Opening a connection (the SQLite engine is SQLite3 Multiple Ciphers, the same as Electron's `better-sqlite3-multiple-ciphers`): `PRAGMA cipher = 'sqlcipher'` (must come before the key; the SQLite3MC default cipher is ChaCha20, not SQLCipher), then `PRAGMA key = '<derived base64>'` (no single quote is possible in base64; still escape `'` → `''`), then `PRAGMA foreign_keys = ON`, then `SELECT 1 FROM sqlite_master LIMIT 1` (errors on a wrong key).

**`create_database`**, checked in this order:

1. `password` length < 8 → `{ success: false, error: 'Password must be at least 8 characters' }`
2. The DB file exists → `{ success: false, error: 'Database already exists' }`
3. Salt = read `.salt` if it exists, else generate 32 random bytes and write them. Derive the key, open (creating) the DB, apply the key and pragmas, run the schema init, store the connection in state, reset the unlock throttle to 0 → `{ success: true }`.
4. Any error in step 3 → `{ success: false, error: <Display> }`.

**`unlock_database`**, checked in this order:

1. The DB file or `.salt` is missing → `{ success: false, error: 'Database does not exist' }`
2. `password` is empty → `{ success: false, error: 'Password cannot be empty' }`
3. **Throttle:** if `failed_attempts > 0`, sleep `min(failed_attempts * 500, 5000)` ms first. Don't hold the DB lock while sleeping.
4. Derive the key from `.salt`, open the connection, apply the pragmas and the key check, then run the schema init (idempotent, includes the column backfill). On success, store the connection in state (replacing any previous one), set `failed_attempts = 0` → `{ success: true }`.
5. Any failure in step 4 → `failed_attempts += 1`, leave the existing state connection untouched → `{ success: false, error: 'Incorrect password provided' }`.

The throttle counter is in-memory managed state, starts at 0 on every launch, and is shared across calls.

**`change_password`**, checked in this order (no throttle involvement):

1. `newPassword` length < 8 → `{ success: false, error: 'New password must be at least 8 characters' }`
2. `currentPassword` is empty → `{ success: false, error: 'Current password cannot be empty' }`
3. Derive the current key from `.salt`, and verify it with a **separate, temporary** connection to the DB file (the same open sequence, then close it). If that fails → `{ success: false, error: 'Current password is incorrect' }`
4. Generate a new 32-byte salt, derive the new key, run `PRAGMA rekey = '<new key>'` on the **live** connection (none → error `Database is locked`), and only then overwrite `.salt` with the new salt → `{ success: true }`.
5. Any error in steps 3 and 4 other than the verify failure (for example reading the salt, the rekey, or no live connection) → `{ success: false, error: <Display> }`.

### Habits

All of these require an unlocked DB (otherwise `Locked`). They return `Result<T, AppError>`.

| Command                | Args (JS)                                                                                   | Returns   | SQL (exact semantics)                                                                                                                                                          | Replaces               |
| ---------------------- | ------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `get_all_habits`       | none                                                                                        | `Habit[]` | `SELECT * FROM habits WHERE status IN (1, 2) ORDER BY sort_order ASC, id ASC`                                                                                                  | `get-all-habits`       |
| `add_habit`            | `{ name: string, color: string }`                                                           | `number`  | `next = SELECT COALESCE(MAX(sort_order), 0) + 1 FROM habits`, then `INSERT INTO habits (name, color, status, sort_order) VALUES (?, ?, 1, next)`. Returns `last_insert_rowid`. | `add-habit`            |
| `update_habit`         | `{ habitId: number, currentStreak: number, longestStreak: number, completionRate: number }` | `void`    | `UPDATE habits SET current_streak = ?, longest_streak = ?, completion_rate = ? WHERE id = ?`                                                                                   | `update-habit`         |
| `set_habit_weight`     | `{ habitId: number, weight: number }`                                                       | `void`    | `UPDATE habits SET weight = ? WHERE id = ?`                                                                                                                                    | `set-habit-weight`     |
| `set_habit_target`     | `{ habitId: number, targetPerWeek: number \| null }`                                        | `void`    | `UPDATE habits SET target_per_week = ? WHERE id = ?` (`null` → SQL NULL)                                                                                                       | `set-habit-target`     |
| `update_habit_details` | `{ habitId: number, name: string, color: string }`                                          | `void`    | `UPDATE habits SET name = ?, color = ? WHERE id = ?`                                                                                                                           | `update-habit-details` |
| `remove_habit`         | `{ habitId: number }`                                                                       | `void`    | In **one transaction**: `UPDATE habits SET status = 0 WHERE id = ?` and `UPDATE habit_logs SET status = 0 WHERE habit_id = ?` (soft delete)                                    | `remove-habit`         |
| `reorder_habits`       | `{ orderedIds: number[] }`                                                                  | `void`    | In **one transaction**: for each `(index, id)`: `UPDATE habits SET sort_order = index WHERE id = id` (index is 0-based)                                                        | `reorder-habits`       |
| `archive_habit`        | `{ habitId: number }`                                                                       | `void`    | `UPDATE habits SET status = 2 WHERE id = ?` (logs untouched)                                                                                                                   | `archive-habit`        |
| `unarchive_habit`      | `{ habitId: number }`                                                                       | `void`    | `UPDATE habits SET status = 1 WHERE id = ?`                                                                                                                                    | `unarchive-habit`      |

### Habit logs

| Command              | Args (JS)                                          | Returns      | SQL                                                                                                                                                       | Replaces             |
| -------------------- | -------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `get_all_habit_logs` | none                                               | `HabitLog[]` | `SELECT * FROM habit_logs WHERE status = 1`                                                                                                               | `get-all-habit-logs` |
| `update_habit_log`   | `{ habitId: number, date: string, state: number }` | `void`       | `INSERT INTO habit_logs (habit_id, date, state, status) VALUES (?, ?, ?, 1) ON CONFLICT(habit_id, date) DO UPDATE SET state = excluded.state, status = 1` | `update-habit-log`   |

### Settings

| Command            | Args (JS)                        | Returns                  | SQL                                                                                                     | Replaces           |
| ------------------ | -------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------ |
| `get_all_settings` | none                             | `Record<string, string>` | `SELECT key, value FROM settings` → JSON object (Rust `HashMap<String, String>`)                        | `get-all-settings` |
| `set_setting`      | `{ key: string, value: string }` | `void`                   | `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value` | `set-setting`      |

### Schema (run on create and unlock, idempotent)

This is the exact DDL from `src/main/db.ts` `initSchema`: the three `CREATE TABLE IF NOT EXISTS` statements (`habits`, `habit_logs`, `settings`). Then, if `habits` lacks `target_per_week` or `sort_order`, run `ALTER TABLE habits ADD COLUMN target_per_week INTEGER` / `... sort_order INTEGER`. Then run `UPDATE habits SET sort_order = id WHERE sort_order IS NULL`. Copy the DDL verbatim. Don't add a migration system.

## Events

None. The Electron app sends no main → renderer messages.

## Native behavior (no command, no JS API)

- **New windows / external links:** the `main` webview denies every new-window request (`window.open`, `target="_blank"`). If the URL scheme is `http` or `https`, Rust opens it in the OS default browser (`tauri-plugin-opener`, called from Rust only). Other schemes and malformed URLs are ignored. The frontend needs no code for this.
- **Window:** label `main`, title `Habit Tracker`, 900×670. DevTools open automatically in debug builds only.
- **CSP** (`app.security.csp`): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src ipc: http://ipc.localhost`. `withGlobalTauri: false`.

## Changelog

- 2026-10-08: initial contract from the Electron preload bridge (19 commands, 0 events). Affects T03–T09.
- 2026-10-08: the DB engine switched from SQLCipher (vendored OpenSSL) to SQLite3 Multiple Ciphers, and the opening sequence now sets `PRAGMA cipher = 'sqlcipher'` before the key, exactly like Electron. Reason: the vendored OpenSSL build needs a Windows-native perl that isn't available (T04, first attempt). Affects T04–T06.
