export type ScoreEntry = {
  habitId: number
  weight: number
  completed: number
  streak: number
  misses: number
}

export type ScoreMap = {
  date: string
  entries: ScoreEntry[]
}
