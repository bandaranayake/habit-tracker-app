// The only module that touches Tauri. Mirrors docs/ipc-contract.md exactly.
import { invoke } from '@tauri-apps/api/core'
import type { Habit } from '@/interfaces/habit'
import type { HabitLog } from '@/interfaces/habitLog'

export interface DbResult {
  success: boolean
  error?: string
}

export type AppErrorKind = 'Locked' | 'Database' | 'Io'

/** What a rejected invoke promise carries: a plain object, not an Error. */
export interface AppError {
  kind: AppErrorKind
  message: string
}

/** Message from a thrown `Error` or a rejected `AppError`, else `fallback`. */
export const errorMessage = (err: unknown, fallback: string): string => {
  const message = (err as { message?: unknown } | null | undefined)?.message
  return typeof message === 'string' ? message : fallback
}

export const habitAPI = {
  getAllHabits: (): Promise<Habit[]> => invoke<Habit[]>('get_all_habits'),
  getAllHabitLogs: (): Promise<HabitLog[]> => invoke<HabitLog[]>('get_all_habit_logs'),
  addHabit: (name: string, color: string): Promise<number> =>
    invoke<number>('add_habit', { name, color }),
  updateHabit: (
    habitId: number,
    current_streak: number,
    longest_streak: number,
    completion_rate: number
  ): Promise<void> =>
    invoke<void>('update_habit', {
      habitId,
      currentStreak: current_streak,
      longestStreak: longest_streak,
      completionRate: completion_rate
    }),
  setHabitWeight: (habitId: number, weight: number): Promise<void> =>
    invoke<void>('set_habit_weight', { habitId, weight }),
  setHabitTarget: (habitId: number, targetPerWeek: number | null): Promise<void> =>
    invoke<void>('set_habit_target', { habitId, targetPerWeek }),
  updateHabitDetails: (habitId: number, name: string, color: string): Promise<void> =>
    invoke<void>('update_habit_details', { habitId, name, color }),
  updateHabitLog: (habitId: number, date: string, state: number): Promise<void> =>
    invoke<void>('update_habit_log', { habitId, date, state }),
  removeHabit: (habitId: number): Promise<void> => invoke<void>('remove_habit', { habitId }),
  reorderHabits: (orderedIds: number[]): Promise<void> =>
    invoke<void>('reorder_habits', { orderedIds }),
  archiveHabit: (habitId: number): Promise<void> => invoke<void>('archive_habit', { habitId }),
  unarchiveHabit: (habitId: number): Promise<void> => invoke<void>('unarchive_habit', { habitId }),
  saltExists: (): Promise<boolean> => invoke<boolean>('salt_exists'),
  dbExists: (): Promise<boolean> => invoke<boolean>('db_exists'),
  createDatabase: (password: string): Promise<DbResult> =>
    invoke<DbResult>('create_database', { password }),
  unlockDatabase: (password: string): Promise<DbResult> =>
    invoke<DbResult>('unlock_database', { password }),
  changePassword: (currentPassword: string, newPassword: string): Promise<DbResult> =>
    invoke<DbResult>('change_password', { currentPassword, newPassword }),
  getAllSettings: (): Promise<Record<string, string>> =>
    invoke<Record<string, string>>('get_all_settings'),
  setSetting: (key: string, value: string): Promise<void> =>
    invoke<void>('set_setting', { key, value })
}
