// Log-entry states (the `state` column on habit_logs).
export const HABIT_STATUS_MISSED = 1
export const HABIT_STATUS_COMPLETED = 2
export const HABIT_STATUS_SKIPPED = 3

// Habit row lifecycle (the `status` column on habits). Deleted rows (0) never
// reach the renderer.
export const HABIT_ACTIVE = 1
export const HABIT_ARCHIVED = 2

export const HABIT_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-red-500',
  'bg-indigo-500'
]

// Selectable relative importance of a habit, used by the score algorithm.
export const HABIT_WEIGHTS = [0.5, 1, 1.5, 2, 3]

// Selectable per-habit weekly goal. `null` is a daily habit (expected every day);
// 1-6 means "complete this N times per week", and off days are not penalised.
export const HABIT_TARGET_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Daily' },
  { value: 1, label: '1×/week' },
  { value: 2, label: '2×/week' },
  { value: 3, label: '3×/week' },
  { value: 4, label: '4×/week' },
  { value: 5, label: '5×/week' },
  { value: 6, label: '6×/week' }
]

/** Short label for a habit's goal, e.g. `"3×/week"` or `"Daily"`. */
export const formatTarget = (targetPerWeek: number | null): string =>
  targetPerWeek == null ? 'Daily' : `${targetPerWeek}×/week`
