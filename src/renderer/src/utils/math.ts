import { HABIT_STATUS_COMPLETED, HABIT_STATUS_MISSED, HABIT_STATUS_SKIPPED } from './constant'
import { daysBetween, formatDate, isSameDate, startOfDay, startOfWeek, weekKey } from './date'
import { Habit } from '@/interfaces/habit'
import { HabitLog } from '@/interfaces/habitLog'
import { ChartData } from '@/types/chartData'

const STREAK_LOOKBACK_DAYS = 365
const STREAK_LOOKBACK_WEEKS = 104
const DAYS_PER_WEEK = 7

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

/**
 * Completed logs per week, keyed by the `formatDate` of the week's Sunday.
 * Only `HABIT_STATUS_COMPLETED` counts toward a weekly goal; skipped days are
 * intentional pauses and do not advance the target.
 */
const weeklyCompletionCounts = (records: HabitLog[]): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const r of records) {
    if (r.state !== HABIT_STATUS_COMPLETED) continue
    const key = weekKey(parseLocalDay(r.date))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/**
 * Current streak, in weeks, for a habit with a weekly goal: consecutive weeks
 * (ending with the current one) in which at least `target` days were completed.
 * The in-progress week counts only once its target is already met; before that
 * it neither adds to nor breaks the streak.
 */
const calculateWeeklyStreak = (records: HabitLog[], target: number): number => {
  const counts = weeklyCompletionCounts(records)
  const cursor = startOfWeek(new Date())

  let streak = 0
  for (let i = 0; i < STREAK_LOOKBACK_WEEKS; i++) {
    const done = counts.get(formatDate(cursor)) ?? 0
    if (done >= target) {
      streak++
    } else if (i === 0) {
      // current week still in progress - don't count it yet, keep looking back
    } else {
      break
    }
    cursor.setDate(cursor.getDate() - DAYS_PER_WEEK)
  }

  return streak
}

/** Longest run of consecutive weeks that met `target`, anywhere in the history. */
const getLongestWeeklyStreak = (records: HabitLog[], target: number): number => {
  const counts = weeklyCompletionCounts(records)
  if (counts.size === 0) return 0

  const earliest = records
    .map((r) => r.date)
    .reduce((min, d) => (d < min ? d : min), records[0].date)
  const thisWeekStart = startOfWeek(new Date())
  const cursor = startOfWeek(parseLocalDay(earliest))

  let maxStreak = 0
  let run = 0
  while (cursor <= thisWeekStart) {
    const done = counts.get(formatDate(cursor)) ?? 0
    const isCurrentWeek = cursor.getTime() === thisWeekStart.getTime()
    if (done >= target) {
      run++
      maxStreak = Math.max(maxStreak, run)
    } else if (!isCurrentWeek) {
      run = 0
    }
    cursor.setDate(cursor.getDate() + DAYS_PER_WEEK)
  }

  return maxStreak
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
 * Current streak. For a daily habit (`targetPerWeek == null`) this is
 * consecutive completed days ending today (or yesterday, if today has not been
 * logged yet): a skipped day keeps it alive without extending it; a missed day
 * or an unlogged past day ends it. For a habit with a weekly goal it is instead
 * counted in *weeks* that met the target - see `calculateWeeklyStreak`.
 */
export const calculateStreak = (
  records: HabitLog[],
  targetPerWeek: number | null = null
): number => {
  if (targetPerWeek != null) {
    return calculateWeeklyStreak(records, targetPerWeek)
  }

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

/**
 * Longest streak ever: consecutive completed days for a daily habit, or
 * consecutive weeks that met the target for a habit with a weekly goal.
 */
export const getLongestStreak = (
  records: HabitLog[],
  targetPerWeek: number | null = null
): number => {
  if (targetPerWeek != null) {
    return getLongestWeeklyStreak(records, targetPerWeek)
  }

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
 *   expected  = daysTracked * (target_per_week ?? 7) / 7
 *   adherence = min(1, completed / expected)
 *   habitScore = min(1, adherence * 0.9^misses * (1 + streak/10))
 *
 * i.e. a 0..1 "consistency" number: how much of the *expected* volume was done
 * (a daily habit expects one completion per day; a "3×/week" habit expects
 * three, so its off days are not held against it), nudged down by recent misses
 * and up by the current streak. A perfectly kept habit sits at 1.0. The streak
 * bonus is daily-only - for a weekly goal the day-level streak is not meaningful.
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
      const perWeek = habit.target_per_week ?? DAYS_PER_WEEK
      const expected = (daysTracked * perWeek) / DAYS_PER_WEEK
      const adherence = Math.min(1, state.completed / expected)
      const bonus = habit.target_per_week == null ? streakBonus(state.streak) : 1
      const habitScore = Math.min(1, adherence * missPenalty(state.misses) * bonus)

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
