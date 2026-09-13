import Database from 'better-sqlite3-multiple-ciphers'

let db: Database.Database

// Row shapes as stored in SQLite (include soft-delete `status`, unlike the
// renderer-facing interfaces in src/renderer/src/interfaces).
export interface HabitRow {
  id: number
  name: string
  color: string
  status: number
  weight: number
  /** Target completions per week; `null` means a daily habit (expected every day). */
  target_per_week: number | null
  /** User-controlled list position; lower sorts first. Backfilled from `id`. */
  sort_order: number
  current_streak: number
  longest_streak: number
  completion_rate: number
  created_at: string
}

export interface HabitLogRow {
  id: number
  habit_id: number
  date: string
  state: number
  status: number
}

export interface SettingRow {
  key: string
  value: string
}

/**
 * Add a column to an existing table if it is missing. There is no migration
 * system, but a schema change must not wipe a developer's local database, so
 * columns added after the initial `CREATE TABLE` are backfilled here. New
 * databases get the column straight from the `CREATE TABLE` DDL below.
 */
function ensureColumn(
  handle: Database.Database,
  table: string,
  column: string,
  definition: string
): void {
  const columns = handle.pragma(`table_info(${table})`) as { name: string }[]
  if (!columns.some((c) => c.name === column)) {
    handle.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

/**
 * The full schema. There is no migration system: the app has no released
 * versions with existing user databases, so schema changes edit this DDL
 * directly. `IF NOT EXISTS` keeps `createEncryptedDatabase` idempotent.
 */
function initSchema(handle: Database.Database): void {
  handle.exec(`
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
  `)

  ensureColumn(handle, 'habits', 'target_per_week', 'INTEGER')
  ensureColumn(handle, 'habits', 'sort_order', 'INTEGER')
  // Backfill list positions for rows created before `sort_order` existed so the
  // ordering is stable and every row compares cleanly.
  handle.exec(`UPDATE habits SET sort_order = id WHERE sort_order IS NULL`)
}

function applyKey(dbPath: string, key: string): Database.Database {
  const handle = new Database(dbPath)
  handle.pragma(`cipher = 'sqlcipher'`)
  // `key` is a base64-encoded PBKDF2 output: its alphabet (A-Za-z0-9+/=) cannot
  // contain a single quote, so it cannot break out of the quoted pragma. The
  // escape below is defense-in-depth only.
  handle.pragma(`key = '${key.replace(/'/g, "''")}'`)
  handle.pragma('foreign_keys = ON')
  return handle
}

/** Whether `key` opens the database at `dbPath`, without touching the live connection. */
export function verifyKey(dbPath: string, key: string): boolean {
  let handle: Database.Database | undefined
  try {
    handle = applyKey(dbPath, key)
    handle.prepare('SELECT 1 FROM sqlite_master LIMIT 1').get()
    return true
  } catch {
    return false
  } finally {
    handle?.close()
  }
}

export function openEncryptedDatabase(dbPath: string, key: string): void {
  db = applyKey(dbPath, key)
  // Throws if the key is wrong (cannot read the encrypted header).
  db.prepare('SELECT 1 FROM sqlite_master LIMIT 1').get()
  // Idempotent: backfills any columns added since this database was created.
  initSchema(db)
}

export function createEncryptedDatabase(dbPath: string, key: string): void {
  db = applyKey(dbPath, key)
  initSchema(db)
}

// Row `status` values shared by `habits` and `habit_logs`.
export const STATUS_DELETED = 0
export const STATUS_ACTIVE = 1
export const STATUS_ARCHIVED = 2

// Functions
export function getAllHabits(): HabitRow[] {
  // Active and archived habits; archived ones are filtered out in the renderer
  // for the tracking views but still shown in the archived list.
  return db
    .prepare(
      `SELECT * FROM habits WHERE status IN (${STATUS_ACTIVE}, ${STATUS_ARCHIVED})
       ORDER BY sort_order ASC, id ASC`
    )
    .all() as HabitRow[]
}

export function getAllHabitLogs(): HabitLogRow[] {
  return db.prepare(`SELECT * FROM habit_logs WHERE status = 1`).all() as HabitLogRow[]
}

export function addHabit(name: string, color: string): number {
  // New habits land at the end of the list.
  const { next } = db
    .prepare(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM habits`)
    .get() as { next: number }
  return db
    .prepare(`INSERT INTO habits (name, color, status, sort_order) VALUES (?, ?, 1, ?)`)
    .run(name, color, next).lastInsertRowid as number
}

/**
 * Persist a user-defined habit order. `orderedIds` is the full list of habit ids
 * in their new order; each row's `sort_order` is set to its index.
 */
export function reorderHabits(orderedIds: number[]): void {
  const update = db.prepare(`UPDATE habits SET sort_order = ? WHERE id = ?`)
  const run = db.transaction((ids: number[]) => {
    ids.forEach((id, index) => update.run(index, id))
  })
  run(orderedIds)
}

export function updateHabit(
  habitId: number,
  current_streak: number,
  longest_streak: number,
  completion_rate: number
): void {
  db.prepare(
    `UPDATE habits SET current_streak = ?, longest_streak = ?, completion_rate = ? WHERE id = ?`
  ).run(current_streak, longest_streak, completion_rate, habitId)
}

export function setHabitWeight(habitId: number, weight: number): void {
  db.prepare(`UPDATE habits SET weight = ? WHERE id = ?`).run(weight, habitId)
}

/** `targetPerWeek` is 1-6 for a weekly goal, or `null` for a daily habit. */
export function setHabitTarget(habitId: number, targetPerWeek: number | null): void {
  db.prepare(`UPDATE habits SET target_per_week = ? WHERE id = ?`).run(targetPerWeek, habitId)
}

export function updateHabitDetails(habitId: number, name: string, color: string): void {
  db.prepare(`UPDATE habits SET name = ?, color = ? WHERE id = ?`).run(name, color, habitId)
}

export function updateHabitLog(habitId: number, date: string, state: number): void {
  db.prepare(
    `INSERT INTO habit_logs (habit_id, date, state, status) VALUES (?, ?, ?, 1) ON CONFLICT(habit_id, date) DO UPDATE SET state = excluded.state, status = 1`
  ).run(habitId, date, state)
}

export function removeHabit(habitId: number): void {
  const remove = db.transaction(() => {
    db.prepare(`UPDATE habits SET status = ${STATUS_DELETED} WHERE id = ?`).run(habitId)
    db.prepare(`UPDATE habit_logs SET status = ${STATUS_DELETED} WHERE habit_id = ?`).run(habitId)
  })
  remove()
}

/** Stop tracking a habit without deleting it; its logs are left untouched. */
export function archiveHabit(habitId: number): void {
  db.prepare(`UPDATE habits SET status = ${STATUS_ARCHIVED} WHERE id = ?`).run(habitId)
}

/** Resume tracking a previously archived habit. */
export function unarchiveHabit(habitId: number): void {
  db.prepare(`UPDATE habits SET status = ${STATUS_ACTIVE} WHERE id = ?`).run(habitId)
}

/** All app preferences as a flat key/value map (missing keys just aren't present). */
export function getAllSettings(): Record<string, string> {
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as SettingRow[]
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value)
}

/**
 * Re-encrypt the open database with a new key (SQLCipher `PRAGMA rekey`). The
 * caller is responsible for verifying the current password first - this just
 * swaps the key on the already-open handle.
 */
export function rekeyDatabase(newKey: string): void {
  db.pragma(`rekey = '${newKey.replace(/'/g, "''")}'`)
}
