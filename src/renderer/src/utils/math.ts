import { HABIT_STATUS_COMPLETED, HABIT_STATUS_MISSED, HABIT_STATUS_SKIPPED } from './constant'
import { daysBetween, formatDate, isSameDate, startOfDay } from './date'
import { Habit } from '@/interfaces/habit'
import { HabitLog } from '@/interfaces/habitLog'
import { ChartData } from '@/types/chartData'

const STREAK_LOOKBACK_DAYS = 365

/**
 * Parse a `"YYYY-MM-DD"` (or `"YYYY-MM-DD HH:MM:SS"`) string to local midnight of
 * that calendar day, avoiding UTC-vs-local skew near midnight.
 */
const parseLocalDay = (timestamp: string): Date => {
  const [y, m, d] = timestamp.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** Long streaks earn a multiplier: +10% per consecutive completed day. */
const streakBonus = (currentStreak: number): number => {
  return 1 + currentStreak / 10
}

/** Recent misses shrink a habit's score: each miss multiplies by 0.9. */
const missPenalty = (misses: number): number => {
  return Math.pow(0.9, misses)
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
 * Daily habit-score series for the current calendar year.
 *
 * Design goals:
 * - **Adding a habit never moves the score.** A habit is invisible to the score
 *   until it has been engaged with at least once — it enters on its first log
 *   date, not its creation date. Creating a habit and never logging it changes
 *   nothing.
 * - No discontinuity on Jan 1: the running per-habit state accumulates from each
 *   habit's first log; only the emitted points are clipped to the current year.
 *
 * For a habit on a given day (from its first log onward) with running counters
 * `completed` / `streak` / `misses` and `daysTracked` days since its first log:
 *
 *   habitScore = min(1, completed/daysTracked * 0.9^misses * (1 + streak/10))
 *
 * i.e. a 0..1 "consistency" number: the completion ratio, nudged down by recent
 * misses and up (recovering toward 1) by the current streak. A perfectly kept
 * habit sits at 1.0.
 *
 * The overall day score is the weight-weighted mean of the habitScores of every
 * habit in tracking that day (0 when none are), rounded to 3 decimals. Because
 * it is a capped mean, first-logging a new habit can only hold the score steady
 * or raise it — it never drags a shared denominator down.
 */
export const calculateTotalScores = (habits: Habit[], logs: HabitLog[]): ChartData[] => {
  const today = startOfDay(new Date())
  const displayStart = new Date(today.getFullYear(), 0, 1)

  // First log date per habit; habits with no logs are excluded from the score.
  const firstLog = new Map<number, Date>()
  for (const log of logs) {
    const day = parseLocalDay(log.date)
    const existing = firstLog.get(log.habit_id)
    if (!existing || day < existing) firstLog.set(log.habit_id, day)
  }

  const trackedHabits = habits.filter((h) => firstLog.has(h.id))
  if (trackedHabits.length === 0) {
    return []
  }

  const logIndex = new Map(logs.map((log) => [`${log.habit_id}|${log.date}`, log]))
  const running = new Map(trackedHabits.map((h) => [h.id, { completed: 0, streak: 0, misses: 0 }]))

  // Accumulate from the earliest first-log date across all tracked habits.
  let cursor = new Date(displayStart)
  for (const h of trackedHabits) {
    const start = firstLog.get(h.id)!
    if (start < cursor) cursor = new Date(start)
  }

  const chartData: ChartData[] = []

  for (; cursor <= today; cursor.setDate(cursor.getDate() + 1)) {
    const formattedDate = formatDate(cursor)
    const cursorDay = startOfDay(cursor)

    let weightedScore = 0
    let totalWeight = 0

    for (const habit of trackedHabits) {
      const start = firstLog.get(habit.id)!
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
      // unlogged day: neutral for streak/misses; daysTracked below still grows,
      // so sparse logging decays the habit's score.

      const daysTracked = daysBetween(start, cursorDay) + 1
      const habitScore = Math.min(
        1,
        (state.completed / daysTracked) * missPenalty(state.misses) * streakBonus(state.streak)
      )

      weightedScore += habitScore * habit.weight
      totalWeight += habit.weight
    }

    if (cursorDay >= displayStart) {
      chartData.push({
        date: formattedDate,
        score: totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 1000) / 1000 : 0
      })
    }
  }

  return chartData
}
