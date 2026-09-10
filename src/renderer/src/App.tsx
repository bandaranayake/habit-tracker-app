import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LockScreen from './components/LockScreen'
import { CardHeader, CardTitle, Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getAdjacentMonth } from './utils/date'
import {
  HABIT_ACTIVE,
  HABIT_ARCHIVED,
  HABIT_COLORS,
  HABIT_STATUS_COMPLETED
} from './utils/constant'
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
import { ArchivedHabitsCard } from '@/components/cards/archivedHabitsCard'
import { CalendarCard } from '@/components/cards/calendarCard'
import { HabitLoggerCard } from '@/components/cards/habitLoggerCard'
import { UndoSnackbar } from '@/components/UndoSnackbar'
import BarChart from './components/chart/chart-bar-interactive'
import { ChartData } from './types/chartData'

/** How long the "Habit deleted" undo prompt stays before the delete is committed. */
const DELETE_UNDO_MS = 6000

interface PendingDelete {
  habit: Habit
  records: HabitLog[]
}

/** Recompute a habit's cached stats from the full log set. */
const withRecomputedStats = (habit: Habit, allRecords: HabitLog[]): Habit => {
  const habitRecords = allRecords.filter((r) => r.habit_id === habit.id)
  return {
    ...habit,
    current_streak: calculateStreak(habitRecords, habit.target_per_week),
    longest_streak: getLongestStreak(habitRecords, habit.target_per_week),
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
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeHabits = useMemo(() => habits.filter((h) => h.status === HABIT_ACTIVE), [habits])
  const archivedHabits = useMemo(() => habits.filter((h) => h.status === HABIT_ARCHIVED), [habits])

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
      setChartData(calculateTotalScores(activeHabits, records))
    }
  }, [isLoading, loadError, records, activeHabits])

  // Clear a still-running undo timer if the component goes away.
  useEffect(() => {
    return (): void => {
      if (deleteTimer.current) clearTimeout(deleteTimer.current)
    }
  }, [])

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />
  }

  const addHabit = (): void => {
    const habitName = newHabitName.trim()
    if (!habitName) return

    window.habitAPI
      .addHabit(habitName, HABIT_COLORS[activeHabits.length % HABIT_COLORS.length])
      .then(() => loadHabits())
      .then(() => setNewHabitName(''))
      .catch((error) => console.error(error))
  }

  const commitDelete = (habitId: number): void => {
    window.habitAPI.removeHabit(habitId).catch((error) => {
      console.error(error)
      loadHabits()
    })
  }

  const clearDeleteTimer = (): void => {
    if (deleteTimer.current) {
      clearTimeout(deleteTimer.current)
      deleteTimer.current = null
    }
  }

  // Deferred delete: the habit leaves the UI immediately, but the database
  // soft-delete only fires once the undo window closes.
  const removeHabit = (habitId: number): void => {
    // Only one delete can be pending; commit any earlier one first.
    clearDeleteTimer()
    if (pendingDelete) commitDelete(pendingDelete.habit.id)

    const habit = habits.find((h) => h.id === habitId)
    if (!habit) return
    const habitRecords = records.filter((r) => r.habit_id === habitId)

    setHabits((prev) => prev.filter((h) => h.id !== habitId))
    setRecords((prev) => prev.filter((r) => r.habit_id !== habitId))
    setPendingDelete({ habit, records: habitRecords })

    deleteTimer.current = setTimeout(() => {
      deleteTimer.current = null
      setPendingDelete(null)
      commitDelete(habitId)
    }, DELETE_UNDO_MS)
  }

  const undoDelete = (): void => {
    if (!pendingDelete) return
    clearDeleteTimer()
    const { habit, records: restored } = pendingDelete
    setHabits((prev) => [...prev, habit].sort((a, b) => a.id - b.id))
    setRecords((prev) => [...prev, ...restored])
    setPendingDelete(null)
  }

  const dismissDelete = (): void => {
    if (!pendingDelete) return
    clearDeleteTimer()
    commitDelete(pendingDelete.habit.id)
    setPendingDelete(null)
  }

  const archiveHabit = (habitId: number): void => {
    setHabits((prev) => prev.map((h) => (h.id === habitId ? { ...h, status: HABIT_ARCHIVED } : h)))
    window.habitAPI.archiveHabit(habitId).catch((error) => {
      console.error(error)
      loadHabits()
    })
  }

  const unarchiveHabit = (habitId: number): void => {
    setHabits((prev) => prev.map((h) => (h.id === habitId ? { ...h, status: HABIT_ACTIVE } : h)))
    window.habitAPI.unarchiveHabit(habitId).catch((error) => {
      console.error(error)
      loadHabits()
    })
  }

  const setHabitWeight = (habitId: number, weight: number): void => {
    setHabits((prev) => prev.map((h) => (h.id === habitId ? { ...h, weight } : h)))
    window.habitAPI.setHabitWeight(habitId, weight).catch((error) => {
      console.error(error)
      loadHabits()
    })
  }

  const setHabitTarget = (habitId: number, targetPerWeek: number | null): void => {
    // Changing the goal changes how streaks/score are measured, so recompute
    // this habit's cached stats from its logs.
    setHabits((prev) =>
      prev.map((h) =>
        h.id === habitId
          ? withRecomputedStats({ ...h, target_per_week: targetPerWeek }, records)
          : h
      )
    )
    window.habitAPI.setHabitTarget(habitId, targetPerWeek).catch((error) => {
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

    const currentStreak = calculateStreak(updatedRecords, habit.target_per_week)
    const longestStreak = getLongestStreak(updatedRecords, habit.target_per_week)
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

  const markAllComplete = (date: string): void => {
    if (!date) return
    activeHabits.forEach((habit) => {
      const record = records.find((r) => r.habit_id === habit.id && r.date === date)
      if (record?.state !== HABIT_STATUS_COMPLETED) {
        updateHabitRecord(habit, date, HABIT_STATUS_COMPLETED)
      }
    })
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
                {activeHabits.map((habit) => (
                  <HabitCard
                    key={habit.id}
                    habit={habit}
                    removeHabit={removeHabit}
                    archiveHabit={archiveHabit}
                    setHabitWeight={setHabitWeight}
                    setHabitTarget={setHabitTarget}
                    editHabit={editHabit}
                  />
                ))}
                {activeHabits.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    {archivedHabits.length > 0
                      ? 'No active habits. Unarchive one below or add a new habit above.'
                      : 'No habits yet. Add your first habit above!'}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {archivedHabits.length > 0 && (
            <ArchivedHabitsCard
              habits={archivedHabits}
              onUnarchive={unarchiveHabit}
              onDelete={removeHabit}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <CalendarCard
              currentDate={currentDate}
              selectedDate={selectedDate}
              habits={activeHabits}
              records={records}
              onNavigateMonth={navigateMonth}
              onSelectDate={setSelectedDate}
            />
            <HabitLoggerCard
              selectedDate={selectedDate}
              habits={activeHabits}
              records={records}
              onUpdateRecord={updateHabitRecord}
              onMarkAllComplete={markAllComplete}
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

      {pendingDelete && (
        <UndoSnackbar
          message={`Deleted "${pendingDelete.habit.name}"`}
          onUndo={undoDelete}
          onDismiss={dismissDelete}
        />
      )}
    </div>
  )
}

export default App
