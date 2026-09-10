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
  `)

  ensureColumn(handle, 'habits', 'target_per_week', 'INTEGER')
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

// Functions
export function getAllHabits(): HabitRow[] {
  return db.prepare(`SELECT * FROM habits WHERE status = 1`).all() as HabitRow[]
}

export function getAllHabitLogs(): HabitLogRow[] {
  return db.prepare(`SELECT * FROM habit_logs WHERE status = 1`).all() as HabitLogRow[]
}

export function addHabit(name: string, color: string): number {
  return db.prepare(`INSERT INTO habits (name, color, status) VALUES (?, ?, 1)`).run(name, color)
    .lastInsertRowid as number
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
    db.prepare(`UPDATE habits SET status = 0 WHERE id = ?`).run(habitId)
    db.prepare(`UPDATE habit_logs SET status = 0 WHERE habit_id = ?`).run(habitId)
  })
  remove()
}
