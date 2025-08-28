import { HabitLog } from '@/interfaces/habitLog'
import { Habit } from '../renderer/src/interfaces/habit'

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
      updateHabitLog: (habitId: number, date: string, state: number) => Promise<void>
      removeHabit: (habitId: number) => Promise<void>
      saltExists: () => Promise<boolean>
      dbExists: () => Promise<boolean>
      getKdfSalt: () => Promise<string | null>
      createSalt: () => Promise<string>
      deriveKey: (password: string) => Promise<string | null>
      createEncryptedDb: (key: string) => Promise<{ success: boolean; error?: string }>
      openEncryptedDb: (key: string) => Promise<{ success: boolean; error?: string }>
    }
  }
}

export {}
