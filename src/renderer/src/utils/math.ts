import { HABIT_STATUS_COMPLETED, HABIT_STATUS_MISSED, HABIT_STATUS_SKIPPED } from './constant'
import { formatDate } from './date'
import { Habit } from '@/interfaces/habit'
import { HabitLog } from '@/interfaces/habitLog'
import { ScoreEntry, ScoreMap } from '@/types/score'
import { ChartData } from '@/types/chartData'
import moment from 'moment'

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

export const calculateHabitScore = (habit: Habit, logs: HabitLog[]): number => {
  const daysMissed = logs.filter((log) => log.state === HABIT_STATUS_MISSED).length

  const daysCompleted = logs.filter(
    (log) => log.state === HABIT_STATUS_COMPLETED || log.state === HABIT_STATUS_SKIPPED
  ).length

  const adjustedWeight = calculateWeight(habit.weight, daysMissed)
  const streakBonus = calculateStreakBonus(habit.current_streak)

  return Math.round(daysCompleted * adjustedWeight * streakBonus * 100) / 100
}

export const calculateTotalScores = (habits: Habit[], logs: HabitLog[]): ChartData[] => {
  const chartData: ChartData[] = []
  const scoreMaps: ScoreMap[] = []
  const activeHabitIds: number[] = []
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

      const isActive = currentDate.diff(date, 'days') >= 7

      if (isActive && !activeHabitIds.includes(habit.id)) {
        activeHabitIds.push(habit.id)
      }

      if (!activeHabitIds.includes(habit.id)) continue

      const lastScoreMap = scoreMaps.at(-1)
      const filtered = lastScoreMap?.entries.filter((entry) => entry.habitId === habit.id) ?? []

      const previous: ScoreEntry = filtered[0] ?? {
        habitId: habit.id,
        weight: habit.weight,
        completed: 0,
        streak: 0,
        misses: 0
      }

      let completed = 0
      let streak = 0
      let misses = 0

      if (habitLog.state === HABIT_STATUS_COMPLETED || habitLog.state === HABIT_STATUS_SKIPPED) {
        completed = previous.completed + 1
        misses = 0
      } else {
        completed = previous.completed
        misses = previous.misses + 1
      }

      if (habitLog.state === HABIT_STATUS_COMPLETED) {
        streak = previous.streak + 1
      } else if (habitLog.state === HABIT_STATUS_SKIPPED) {
        streak = previous.streak
      } else {
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
      numerator += completed * adjustedWeight * streakBonus
      denominator += activeHabitIds.length * adjustedWeight
    }

    const scoreMap: ScoreMap = {
      date: formattedDate,
      entries: entries
    }
    scoreMaps.push(scoreMap)

    chartData.push({
      date: formattedDate,
      score: denominator > 0 ? Math.round((numerator / denominator) * 100) / 100 : 0
    })
  }

  return chartData
}
