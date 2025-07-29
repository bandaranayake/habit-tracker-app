import Database from 'better-sqlite3'

let db: Database.Database

export function initDatabase(dbPath: string): void {
  db = new Database(dbPath)

  // Create tables
  db.prepare(
    `
  CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    status INTEGER NOT NULL,
    weight REAL DEFAULT 1.0,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    completion_rate REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`
  ).run()

  db.prepare(
    `
  CREATE TABLE IF NOT EXISTS habit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    state INTEGER NOT NULL,
    status INTEGER NOT NULL,
    FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    UNIQUE(habit_id, date)
  )
`
  ).run()
}

// Types
export interface Habit {
  id: number
  name: string
  created_at: string
}

// Functions
export function getAllHabits(): Habit[] {
  return db.prepare(`SELECT * FROM habits WHERE status = 1`).all()
}

export function getAllHabitLogs(): Habit[] {
  return db.prepare(`SELECT * FROM habit_logs WHERE status = 1`).all()
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

export function updateHabitLog(habitId: number, date: string, state: number): void {
  db.prepare(
    `INSERT INTO habit_logs (habit_id, date, state, status) VALUES (?, ?, ?, 1) ON CONFLICT(habit_id, date) DO UPDATE SET state = excluded.state, status = 1`
  ).run(habitId, date, state)
}

export function removeHabit(habitId: number): void {
  db.prepare(`UPDATE habits SET status = 0 WHERE id = ?`).run(habitId)
  db.prepare(`UPDATE habit_logs SET status = 0 WHERE habit_id = ?`).run(habitId)
}
