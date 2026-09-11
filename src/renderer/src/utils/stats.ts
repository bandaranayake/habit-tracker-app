import { HABIT_STATUS_COMPLETED, HABIT_STATUS_MISSED } from './constant'
import { formatDate, startOfWeek } from './date'
import { HabitLog } from '@/interfaces/habitLog'

export interface HeatmapDay {
  date: string
  /** The log's state, or `null` if the day was never logged. */
  state: number | null
}

/**
 * Trailing weeks of a single habit's log states, GitHub-heatmap style: each
 * inner array is one calendar week (7 days starting on `firstDayOfWeek`),
 * oldest week first, ending with the week containing `today`.
 */
export const buildHeatmapWeeks = (
  records: HabitLog[],
  weeksBack: number,
  firstDayOfWeek: number,
  today: Date = new Date()
): HeatmapDay[][] => {
  const byDate = new Map(records.map((r) => [r.date, r.state]))
  const thisWeekStart = startOfWeek(today, firstDayOfWeek)
  const cursor = new Date(thisWeekStart)
  cursor.setDate(cursor.getDate() - (weeksBack - 1) * 7)

  const weeks: HeatmapDay[][] = []
  for (let w = 0; w < weeksBack; w++) {
    const week: HeatmapDay[] = []
    for (let d = 0; d < 7; d++) {
      const dateString = formatDate(cursor)
      week.push({ date: dateString, state: byDate.get(dateString) ?? null })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

export interface PeriodBreakdown {
  label: string
  /** Completion rate 0-100, or -1 if nothing was tracked (completed/missed) in the period. */
  rate: number
}

const completionRateOf = (records: HabitLog[]): number => {
  const completed = records.filter((r) => r.state === HABIT_STATUS_COMPLETED).length
  const missed = records.filter((r) => r.state === HABIT_STATUS_MISSED).length
  const tracked = completed + missed
  return tracked === 0 ? -1 : Math.round((completed / tracked) * 100)
}

/** Completion rate for each of the last `weeksCount` calendar weeks, oldest first. */
export const weeklyBreakdown = (
  records: HabitLog[],
  weeksCount: number,
  firstDayOfWeek: number,
  today: Date = new Date()
): PeriodBreakdown[] => {
  const thisWeekStart = startOfWeek(today, firstDayOfWeek)

  const result: PeriodBreakdown[] = []
  for (let i = weeksCount - 1; i >= 0; i--) {
    const weekStart = new Date(thisWeekStart)
    weekStart.setDate(weekStart.getDate() - i * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const startStr = formatDate(weekStart)
    const endStr = formatDate(weekEnd)

    const weekRecords = records.filter((r) => r.date >= startStr && r.date <= endStr)
    result.push({
      label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      rate: completionRateOf(weekRecords)
    })
  }
  return result
}

/** Completion rate for each month of `year`, January through December. */
export const monthlyBreakdown = (records: HabitLog[], year: number): PeriodBreakdown[] => {
  const result: PeriodBreakdown[] = []
  for (let month = 0; month < 12; month++) {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
    const monthRecords = records.filter((r) => r.date.startsWith(prefix))
    result.push({
      label: new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short' }),
      rate: completionRateOf(monthRecords)
    })
  }
  return result
}
