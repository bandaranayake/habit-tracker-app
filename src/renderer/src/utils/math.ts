import { HABIT_STATUS_COMPLETED, HABIT_STATUS_MISSED, HABIT_STATUS_SKIPPED } from './constant'
import { daysBetween, formatDate, isSameDate, startOfDay } from './date'
import { Habit } from '@/interfaces/habit'
import { HabitLog } from '@/interfaces/habitLog'
import { ChartData } from '@/types/chartData'

const STREAK_LOOKBACK_DAYS = 365

/**
 * Parse a SQLite timestamp (`"YYYY-MM-DD"` or `"YYYY-MM-DD HH:MM:SS"`) to local
 * midnight of that calendar day, avoiding UTC-vs-local skew near midnight.
 */
const parseLocalDay = (timestamp: string): Date => {
  const [y, m, d] = timestamp.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

const calculateStreakBonus = (currentStreak: number): number => {
  return 1 + currentStreak / 10
}

const calculateWeight = (originalWeight: number, daysMissed: number): number => {
  return originalWeight * Math.pow(0.9, daysMissed)
}

/**
 * Percentage of *tracked* days (completed or missed) that were completed.
 * Skipped days are intentional pauses and are excluded from the denominator.
 */
export const calculateCompletionRate = (records: HabitLog[]): number => {
  const tracked = records.filter(
    (r) => r.state === HABIT_STATUS_COMPLETED || r.state === HABIT_STATUS_MISSED
  )
  if (tracked.length === 0) return 0

  const completedCount = tracked.filter((r) => r.state === HABIT_STATUS_COMPLETED).length
  return Math.round((completedCount / tracked.length) * 100)
}

/**
 * Current streak: consecutive completed days ending today (or yesterday, if
 * today has not been logged yet). A skipped day keeps the streak alive without
 * extending it; a missed day or an unlogged past day ends it.
 */
export const calculateStreak = (records: HabitLog[]): number => {
  const byDate = new Map(records.map((r) => [r.date, r]))
  const today = new Date()

  let streak = 0
  const cursor = new Date(today)

  for (let i = 0; i <= STREAK_LOOKBACK_DAYS; i++) {
    const state = byDate.get(formatDate(cursor))?.state ?? 0

    if (state === HABIT_STATUS_COMPLETED) {
      streak++
    } else if (state === HABIT_STATUS_SKIPPED) {
      // neutral: neither extends nor breaks the streak
    } else if (state === HABIT_STATUS_MISSED) {
      break
    } else if (isSameDate(cursor, today)) {
      // today isn't logged yet - look back one more day before giving up
    } else {
      // an unlogged past day breaks the streak
      break
    }

    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}

/** Longest run of consecutive completed days anywhere in the history. */
export const getLongestStreak = (records: HabitLog[]): number => {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))

  let maxStreak = 0
  let currentStreak = 0

  for (const record of sorted) {
    if (record.state === HABIT_STATUS_COMPLETED) {
      currentStreak++
      maxStreak = Math.max(maxStreak, currentStreak)
    } else if (record.state === HABIT_STATUS_MISSED) {
      currentStreak = 0
    }
    // skipped: leave the run untouched
  }

  return maxStreak
}

/**
 * Daily habit score series for the current calendar year.
 *
 * The running per-habit state (completed count, streak, misses) accumulates
 * from each habit's `created_at` so scores don't discontinuously reset on
 * Jan 1; only the emitted points are clipped to the current year.
 *
 * Each day, every habit that already exists contributes:
 *   numerator   += completed * weight * 0.9^misses * (1 + streak/10)
 *   denominator += (daysActive + 1) * weight
 * score = round(numerator / denominator, 3)   (roughly 0..1)
 */
export const calculateTotalScores = (habits: Habit[], logs: HabitLog[]): ChartData[] => {
  const today = startOfDay(new Date())
  const displayStart = new Date(today.getFullYear(), 0, 1)

  const activeHabits = habits.filter((h) => h.created_at)
  if (activeHabits.length === 0) return []

  const createdAt = new Map(activeHabits.map((h) => [h.id, parseLocalDay(h.created_at)]))

  // Start accumulating from the earliest habit creation (or the year start).
  let cursor = new Date(displayStart)
  for (const h of activeHabits) {
    const c = createdAt.get(h.id)!
    if (c < cursor) cursor = new Date(c)
  }

  const logIndex = new Map(logs.map((log) => [`${log.habit_id}|${log.date}`, log]))
  const running = new Map(activeHabits.map((h) => [h.id, { completed: 0, streak: 0, misses: 0 }]))

  const chartData: ChartData[] = []

  for (; cursor <= today; cursor.setDate(cursor.getDate() + 1)) {
    const formattedDate = formatDate(cursor)
    const cursorDay = startOfDay(cursor)

    let numerator = 0
    let denominator = 0

    for (const habit of activeHabits) {
      const start = createdAt.get(habit.id)!
      if (cursorDay < start) continue

      const state = running.get(habit.id)!
      const log = logIndex.get(`${habit.id}|${formattedDate}`)

      if (log?.state === HABIT_STATUS_COMPLETED) {
        state.completed += 1
        state.streak += 1
        state.misses = 0
      } else if (log?.state === HABIT_STATUS_SKIPPED) {
        state.completed += 1
      } else if (log?.state === HABIT_STATUS_MISSED) {
        state.misses += 1
        state.streak = 0
      }
      // unlogged day: neutral for streak/misses, but it still enlarges the
      // denominator below, which is what deflates sparse logging.

      const adjustedWeight = calculateWeight(habit.weight, state.misses)
      const streakBonus = calculateStreakBonus(state.streak)
      const daysActive = daysBetween(start, cursorDay) + 1

      numerator += state.completed * adjustedWeight * streakBonus
      denominator += daysActive * habit.weight
    }

    if (cursorDay >= displayStart) {
      chartData.push({
        date: formattedDate,
        score: denominator > 0 ? Math.round((numerator / denominator) * 1000) / 1000 : 0
      })
    }
  }

  return chartData
}
