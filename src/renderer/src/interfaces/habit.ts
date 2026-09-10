export interface Habit {
  id: number
  name: string
  color: string
  weight: number
  /** Target completions per week; `null` means a daily habit (expected every day). */
  target_per_week: number | null
  current_streak: number
  longest_streak: number
  completion_rate: number
  created_at: string
}
