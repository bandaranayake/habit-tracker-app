'use client'

import { useEffect, useState } from 'react'
import LockScreen from './components/LockScreen'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import {
  formatDate,
  formatDisplayDate,
  getAdjacentMonth,
  getDaysInMonth,
  getLocaleDateString,
  isFutureDate,
  isSameDate,
  isToday
} from './utils/date'
import {
  HABIT_COLORS,
  HABIT_STATUS_COMPLETED,
  HABIT_STATUS_MISSED,
  HABIT_STATUS_SKIPPED
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
import BarChart from './components/chart/chart-bar-interactive'
import { ChartData } from './types/chartData'

function App(): JSX.Element {
  const [unlocked, setUnlocked] = useState(false)
  const [habits, setHabits] = useState<Habit[]>([])
  const [records, setRecords] = useState<HabitLog[]>([])
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [newHabitName, setNewHabitName] = useState<string>('')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (unlocked && window.habitAPI) {
      loadHabits()
    }
  }, [unlocked])

  useEffect(() => {
    if (!isLoading) {
      setChartData(calculateTotalScores(habits, records))
    }
  }, [isLoading, records, habits])

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />
  }

  const loadHabits = async (): Promise<void> => {
    setIsLoading(true)
    window.habitAPI
      .getAllHabits()
      .then((habits) => {
        setHabits(habits)
      })
      .then(() => window.habitAPI.getAllHabitLogs().then((logs) => setRecords(logs)))
      .finally(() => {
        setIsLoading(false)
      })
      .catch((error) => {
        console.error(error)
      })
  }

  const addHabit = (): void => {
    const habbitName = newHabitName.trim()

    if (habbitName) {
      window.habitAPI
        .addHabit(habbitName, HABIT_COLORS[habits.length % HABIT_COLORS.length])
        .then(() => loadHabits())
        .finally(() => {
          setNewHabitName('')
        })
        .catch((error) => {
          console.error(error)
        })
    }
  }

  const removeHabit = (habitId: number): void => {
    window.habitAPI
      .removeHabit(habitId)
      .then(() => {
        setHabits((prev) => prev.filter((h) => h.id !== habitId))
        setRecords((prev) => prev.filter((r) => r.id !== habitId))
      })
      .catch((error) => {
        console.error(error)
      })
  }

  const updateHabitLogs = (
    records: HabitLog[],
    habitId: number,
    date: string,
    state: number
  ): HabitLog[] => {
    const index = records.findIndex((record) => record.date === date)

    if (index !== -1) {
      const updated = [...records]
      updated[index] = { ...updated[index], state }
      return updated
    }

    return [...records, { id: 0, habit_id: habitId, date, state }]
  }

  const updateHabitRecord = (habit: Habit, date: string, state: number): void => {
    const habitId = habit.id
    const filteredRecords = records.filter((record) => record.habit_id === habitId)
    const updatedRecords = updateHabitLogs(filteredRecords, habitId, date, state)

    const currentStreak = calculateStreak(updatedRecords)
    const longestStreak = getLongestStreak(updatedRecords)
    const completionRate = calculateCompletionRate(updatedRecords)

    window.habitAPI
      .updateHabitLog(habitId, date, state)
      .then(() => {
        window.habitAPI.updateHabit(habitId, currentStreak, longestStreak, completionRate)
      })
      .then(() => {
        setRecords((prevRecords) => {
          const otherRecords = prevRecords.filter((record) => record.habit_id !== habitId)
          return [...otherRecords, ...updatedRecords]
        })

        setHabits((prevHabits) =>
          prevHabits.map((habit) =>
            habit.id === habitId
              ? {
                  ...habit,
                  current_streak: currentStreak,
                  longest_streak: longestStreak,
                  completion_rate: completionRate
                }
              : habit
          )
        )
      })
      .catch((error) => {
        console.error(error)
      })
  }

  const navigateMonth = (direction: 'prev' | 'next'): void => {
    setCurrentDate((prev) => getAdjacentMonth(prev, direction))
  }

  const getDayProgress = (date: Date): { completed: number; total: number } => {
    const dateString = formatDate(date)
    const dayRecords = records.filter((r) => r.date === dateString)
    const completed = dayRecords.filter(
      (r) => r.state === HABIT_STATUS_COMPLETED || r.state === HABIT_STATUS_SKIPPED
    ).length
    const total = habits.length
    return { completed, total }
  }

  const days = getDaysInMonth(currentDate)
  const monthYear = getLocaleDateString(currentDate)

  const CalendarCard = (): JSX.Element => (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {monthYear}
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigateMonth('prev')}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigateMonth('next')}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2 mb-4">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-center font-medium text-sm text-muted-foreground p-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map((day, index) => {
            if (!day) {
              return <div key={index} className="h-12" />
            }

            const progress = getDayProgress(day)
            const todayClass = isToday(day) ? 'ring-2 ring-blue-500' : ''
            const selectableDateClass = !isFutureDate(day)
              ? 'cursor-pointer'
              : 'cursor-default hover:bg-transparent'
            const selectedClass = isSameDate(selectedDate, day)
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted'

            let progressRingClass = ''
            if (!isFutureDate(day)) {
              progressRingClass = 'w-1.5 h-1.5 bg-gray-500 rounded-full'
              if (progress.total > 0) {
                if (progress.completed === progress.total) {
                  progressRingClass = 'w-1.5 h-1.5 bg-green-500 rounded-full'
                } else if (progress.completed > 0) {
                  progressRingClass = 'w-1.5 h-1.5 bg-yellow-400 rounded-full'
                }
              }
            }

            return (
              <button
                key={index}
                className={`h-12 p-2 border rounded-lg transition-colors ${todayClass} ${selectedClass} ${selectableDateClass}`}
                onClick={() => {
                  if (!isFutureDate(day)) setSelectedDate(day)
                }}
              >
                <div className="text-sm font-medium">{day.getDate()}</div>
                <div className="flex justify-center mt-1">
                  <div className="flex gap-0.5">
                    <div className={progressRingClass} />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )

  const HabitLoggerCard = (): JSX.Element => (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {selectedDate ? formatDisplayDate(selectedDate) : 'Select a Date'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {selectedDate ? (
          <div className="space-y-2">
            {habits.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Add some habits to get started!
              </p>
            ) : (
              habits.map((habit) => {
                const record = records.find(
                  (r) => r.habit_id === habit.id && r.date === formatDate(selectedDate)
                )
                const state = record?.state || 0
                return (
                  <div key={habit.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${habit.color}`} />
                      <span className="font-medium">{habit.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                          state === HABIT_STATUS_COMPLETED
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-300 hover:border-green-400'
                        }`}
                        onClick={() =>
                          updateHabitRecord(habit, formatDate(selectedDate), HABIT_STATUS_COMPLETED)
                        }
                        title="Mark as completed"
                      >
                        ✓
                      </button>
                      <button
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                          state === HABIT_STATUS_MISSED
                            ? 'bg-red-500 border-red-500 text-white'
                            : 'border-gray-300 hover:border-red-400'
                        }`}
                        onClick={() =>
                          updateHabitRecord(habit, formatDate(selectedDate), HABIT_STATUS_MISSED)
                        }
                        title="Mark as missed"
                      >
                        ✗
                      </button>
                      <button
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                          state === HABIT_STATUS_SKIPPED
                            ? 'bg-yellow-500 border-yellow-500 text-white'
                            : 'border-gray-300 hover:border-yellow-400'
                        }`}
                        onClick={() =>
                          updateHabitRecord(habit, formatDate(selectedDate), HABIT_STATUS_SKIPPED)
                        }
                        title="Mark as skipped"
                      >
                        −
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">
            Click on a date in the calendar to track your habits for that day.
          </p>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Habit Tracker</h1>
        <p className="text-muted-foreground">Track your daily habits and build consistency</p>
      </div>
      {isLoading && <LoadingSpinner />}
      {!isLoading && (
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
                  <HabitCard key={habit.id} habit={habit} removeHabit={removeHabit} />
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
            <CalendarCard />
            <HabitLoggerCard />
          </div>
          <div className="mt-12">
            <BarChart
              title={'Habit Scores'}
              description="Overview of your habit scores for the current year"
              chartData={chartData}
              score={chartData.at(-1)?.score || 0}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default App
