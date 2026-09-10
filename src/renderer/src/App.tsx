import { useCallback, useEffect, useState } from 'react'
import LockScreen from './components/LockScreen'
import { CardHeader, CardTitle, Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getAdjacentMonth } from './utils/date'
import { HABIT_COLORS } from './utils/constant'
import { HabitLog } from './interfaces/habitLog'
import { Habit } from './interfaces/habit'
import { LoadingSpinner } from '@/components/ui/loadingSpinner'
import {
  calculateCompletionRate,
  calculateStreak,
  calculateTotalScores,
  getLongestStreak
} from './utils/math'
import { HabitCard } from '@/components/cards/habitCard'
import { AddHabitCard } from '@/components/cards/addHabitCard'
import { CalendarCard } from '@/components/cards/calendarCard'
import { HabitLoggerCard } from '@/components/cards/habitLoggerCard'
import BarChart from './components/chart/chart-bar-interactive'
import { ChartData } from './types/chartData'

/** Recompute a habit's cached stats from the full log set. */
const withRecomputedStats = (habit: Habit, allRecords: HabitLog[]): Habit => {
  const habitRecords = allRecords.filter((r) => r.habit_id === habit.id)
  return {
    ...habit,
    current_streak: calculateStreak(habitRecords),
    longest_streak: getLongestStreak(habitRecords),
    completion_rate: calculateCompletionRate(habitRecords)
  }
}

const statsChanged = (a: Habit, b: Habit): boolean =>
  a.current_streak !== b.current_streak ||
  a.longest_streak !== b.longest_streak ||
  a.completion_rate !== b.completion_rate

function App(): JSX.Element {
  const [unlocked, setUnlocked] = useState(false)
  const [habits, setHabits] = useState<Habit[]>([])
  const [records, setRecords] = useState<HabitLog[]>([])
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [newHabitName, setNewHabitName] = useState<string>('')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadHabits = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const [loadedHabits, loadedLogs] = await Promise.all([
        window.habitAPI.getAllHabits(),
        window.habitAPI.getAllHabitLogs()
      ])

      // Reconcile the denormalized caches against the source-of-truth logs and
      // persist any drift so every habit's stats are trustworthy.
      const reconciled = loadedHabits.map((h) => withRecomputedStats(h, loadedLogs))
      await Promise.all(
        reconciled.map((h) => {
          const original = loadedHabits.find((o) => o.id === h.id)
          if (original && statsChanged(original, h)) {
            return window.habitAPI.updateHabit(
              h.id,
              h.current_streak,
              h.longest_streak,
              h.completion_rate
            )
          }
          return undefined
        })
      )

      setRecords(loadedLogs)
      setHabits(reconciled)
    } catch (error) {
      console.error(error)
      setLoadError('Could not load your habits. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (unlocked && window.habitAPI) {
      loadHabits()
    }
  }, [unlocked, loadHabits])

  useEffect(() => {
    if (!isLoading && !loadError) {
      setChartData(calculateTotalScores(habits, records))
    }
  }, [isLoading, loadError, records, habits])

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />
  }

  const addHabit = (): void => {
    const habitName = newHabitName.trim()
    if (!habitName) return

    window.habitAPI
      .addHabit(habitName, HABIT_COLORS[habits.length % HABIT_COLORS.length])
      .then(() => loadHabits())
      .then(() => setNewHabitName(''))
      .catch((error) => console.error(error))
  }

  const removeHabit = (habitId: number): void => {
    window.habitAPI
      .removeHabit(habitId)
      .then(() => {
        setHabits((prev) => prev.filter((h) => h.id !== habitId))
        setRecords((prev) => prev.filter((r) => r.habit_id !== habitId))
      })
      .catch((error) => console.error(error))
  }

  const setHabitWeight = (habitId: number, weight: number): void => {
    setHabits((prev) => prev.map((h) => (h.id === habitId ? { ...h, weight } : h)))
    window.habitAPI.setHabitWeight(habitId, weight).catch((error) => {
      console.error(error)
      loadHabits()
    })
  }

  const editHabit = (habitId: number, name: string, color: string): void => {
    setHabits((prev) => prev.map((h) => (h.id === habitId ? { ...h, name, color } : h)))
    window.habitAPI.updateHabitDetails(habitId, name, color).catch((error) => {
      console.error(error)
      loadHabits()
    })
  }

  const mergeHabitLog = (
    habitRecords: HabitLog[],
    habitId: number,
    date: string,
    state: number
  ): HabitLog[] => {
    const index = habitRecords.findIndex((record) => record.date === date)
    if (index !== -1) {
      const updated = [...habitRecords]
      updated[index] = { ...updated[index], state }
      return updated
    }
    return [...habitRecords, { id: 0, habit_id: habitId, date, state }]
  }

  const updateHabitRecord = (habit: Habit, date: string, state: number): void => {
    const habitId = habit.id
    const habitRecords = records.filter((record) => record.habit_id === habitId)
    const updatedRecords = mergeHabitLog(habitRecords, habitId, date, state)

    const currentStreak = calculateStreak(updatedRecords)
    const longestStreak = getLongestStreak(updatedRecords)
    const completionRate = calculateCompletionRate(updatedRecords)

    window.habitAPI
      .updateHabitLog(habitId, date, state)
      .then(() =>
        window.habitAPI.updateHabit(habitId, currentStreak, longestStreak, completionRate)
      )
      .then(() => {
        setRecords((prev) => [
          ...prev.filter((record) => record.habit_id !== habitId),
          ...updatedRecords
        ])
        setHabits((prev) =>
          prev.map((h) =>
            h.id === habitId
              ? {
                  ...h,
                  current_streak: currentStreak,
                  longest_streak: longestStreak,
                  completion_rate: completionRate
                }
              : h
          )
        )
      })
      .catch((error) => console.error(error))
  }

  const navigateMonth = (direction: 'prev' | 'next'): void => {
    setCurrentDate((prev) => getAdjacentMonth(prev, direction))
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Habit Tracker</h1>
        <p className="text-muted-foreground">Track your daily habits and build consistency</p>
      </div>

      {isLoading && <LoadingSpinner />}

      {!isLoading && loadError && (
        <div className="flex flex-col items-center gap-3 py-12">
          <p className="text-destructive">{loadError}</p>
          <Button onClick={() => loadHabits()}>Retry</Button>
        </div>
      )}

      {!isLoading && !loadError && (
        <div className="mx-auto p-6 space-y-6">
          <AddHabitCard
            habitName={newHabitName}
            setHabitName={setNewHabitName}
            addHabit={addHabit}
          />
          <CardHeader>
            <CardTitle>Your Habits</CardTitle>
          </CardHeader>
          <Card>
            <CardContent>
              <div className="space-y-3">
                {habits.map((habit) => (
                  <HabitCard
                    key={habit.id}
                    habit={habit}
                    removeHabit={removeHabit}
                    setHabitWeight={setHabitWeight}
                    editHabit={editHabit}
                  />
                ))}
                {habits.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    No habits yet. Add your first habit above!
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <CalendarCard
              currentDate={currentDate}
              selectedDate={selectedDate}
              habits={habits}
              records={records}
              onNavigateMonth={navigateMonth}
              onSelectDate={setSelectedDate}
            />
            <HabitLoggerCard
              selectedDate={selectedDate}
              habits={habits}
              records={records}
              onUpdateRecord={updateHabitRecord}
            />
          </div>
          <div className="mt-12">
            <BarChart
              title={'Habit Scores'}
              description="Overview of your habit scores for the current year"
              chartData={chartData}
              score={chartData.at(-1)?.score ?? 0}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default App
