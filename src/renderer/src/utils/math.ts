import { HABIT_STATUS_COMPLETED, HABIT_STATUS_MISSED, HABIT_STATUS_SKIPPED } from './constant'
import { formatDate } from './date'
import { Habit } from '@/interfaces/habit'
import { HabitLog } from '@/interfaces/habitLog'
import { ScoreEntry, ScoreMap } from '@/types/score'
import { ChartData } from '@/types/chartData'
import moment, { Moment } from 'moment'

const calculateStreakBonus = (currentStreak: number): number => {
  return 1 + currentStreak / 10
}

const calculateWeight = (originalWeight: number, daysMissed: number): number => {
  return originalWeight * Math.pow(0.9, daysMissed)
}

export const calculateCompletionRate = (records: HabitLog[]): number => {
  const total = records.length
  const completedCount = records.filter(
    (r) => r.state === HABIT_STATUS_COMPLETED || r.state === HABIT_STATUS_SKIPPED
  ).length

  return total > 0 ? Math.round((completedCount / total) * 100) : 0
}

export const calculateStreak = (records: HabitLog[]): number => {
  const today = new Date()
  let streak = 0
  const currentDate = new Date(today)
  const running = true

  while (running) {
    const dateString = formatDate(currentDate)
    const record = records.find((r) => r.date === dateString)
    const state = record?.state || 0

    if (state === HABIT_STATUS_COMPLETED) {
      streak++
    } else if (state === HABIT_STATUS_MISSED) {
      break
    }

    currentDate.setDate(currentDate.getDate() - 1)
    const daysDiff = Math.floor((today.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
    if (daysDiff > 365) break
  }

  return streak
}

export const getLongestStreak = (records: HabitLog[]): number => {
  const sortedRecords = records
    .map((r) => ({ ...r, dateObj: new Date(r.date) }))
    .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())

  let maxStreak = 0
  let currentStreak = 0

  for (let i = 1; i < sortedRecords.length; i++) {
    if (sortedRecords[i].state === HABIT_STATUS_COMPLETED) {
      currentStreak++
      maxStreak = Math.max(maxStreak, currentStreak)
    } else if (sortedRecords[i].state === HABIT_STATUS_MISSED) {
      maxStreak = Math.max(maxStreak, currentStreak)
      currentStreak = 0
    }
  }

  return maxStreak
}

export const calculateTotalScores = (habits: Habit[], logs: HabitLog[]): ChartData[] => {
  const chartData: ChartData[] = []
  const scoreMaps: ScoreMap[] = []
  const habitStartDateMap: Map<number, Moment> = new Map()
  const startDate = moment().startOf('year')
  const currentDate = moment()

  for (let d = startDate.clone(); d.isSameOrBefore(currentDate); d.add(1, 'day')) {
    const date = d.clone()
    const formattedDate = date.format('YYYY-MM-DD')
    const habitLogs = logs.filter((log) => log.date === formattedDate)

    const entries: ScoreEntry[] = []

    let numerator: number = 0
    let denominator: number = 0

    for (const habitLog of habitLogs) {
      const habit = habits.find((h) => h.id === habitLog.habit_id)
      if (!habit) continue

      if (!habitStartDateMap.has(habit.id)) {
        habitStartDateMap.set(habit.id, date)
      }

      const latestScoreMap = scoreMaps.at(-1)
      const filteredEntries =
        latestScoreMap?.entries.filter((entry) => entry.habitId === habit.id) ?? []

      const previousEntry: ScoreEntry = filteredEntries[0] ?? {
        habitId: habit.id,
        weight: habit.weight,
        completed: 0,
        streak: 0,
        misses: 0
      }

      let completed = previousEntry.completed
      let streak = previousEntry.streak
      let misses = previousEntry.misses

      if (habitLog.state === HABIT_STATUS_COMPLETED) {
        completed += 1
        streak += 1
        misses = 0
      } else if (habitLog.state === HABIT_STATUS_SKIPPED) {
        completed += 1
      } else {
        misses += 1
        streak = 0
      }

      const scoreEntry: ScoreEntry = {
        habitId: habit.id,
        weight: habit.weight,
        completed: completed,
        streak: streak,
        misses: misses
      }

      entries.push(scoreEntry)

      const adjustedWeight = calculateWeight(habit.weight, misses)
      const streakBonus = calculateStreakBonus(streak)
      const totalDaysActive = date.diff(habitStartDateMap.get(habit.id), 'days')

      numerator += completed * adjustedWeight * streakBonus
      denominator += (totalDaysActive + 1) * habit.weight
    }

    const scoreMap: ScoreMap = {
      date: formattedDate,
      entries: entries
    }
    scoreMaps.push(scoreMap)

    chartData.push({
      date: formattedDate,
      score: denominator > 0 ? Math.round((numerator / denominator) * 1000) / 1000 : 0
    })
  }

  return chartData
}
