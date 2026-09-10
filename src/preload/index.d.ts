import { HabitLog } from '@/interfaces/habitLog'
import { Habit } from '../renderer/src/interfaces/habit'

export interface DbResult {
  success: boolean
  error?: string
}

declare global {
  interface Window {
    habitAPI: {
      getAllHabits: () => Promise<Habit[]>
      getAllHabitLogs: () => Promise<HabitLog[]>
      addHabit: (name: string, color: string) => Promise<number>
      updateHabit: (
        habitId: number,
        current_streak: number,
        longest_streak: number,
        completion_rate: number
      ) => Promise<void>
      setHabitWeight: (habitId: number, weight: number) => Promise<void>
      setHabitTarget: (habitId: number, targetPerWeek: number | null) => Promise<void>
      updateHabitDetails: (habitId: number, name: string, color: string) => Promise<void>
      updateHabitLog: (habitId: number, date: string, state: number) => Promise<void>
      removeHabit: (habitId: number) => Promise<void>
      archiveHabit: (habitId: number) => Promise<void>
      unarchiveHabit: (habitId: number) => Promise<void>
      saltExists: () => Promise<boolean>
      dbExists: () => Promise<boolean>
      createDatabase: (password: string) => Promise<DbResult>
      unlockDatabase: (password: string) => Promise<DbResult>
    }
  }
}

export {}
