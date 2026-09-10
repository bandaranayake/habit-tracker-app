import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Habit } from '@/interfaces/habit'
import { HabitLog } from '@/interfaces/habitLog'
import { HABIT_STATUS_COMPLETED, HABIT_STATUS_SKIPPED } from '@/utils/constant'
import {
  formatDate,
  getDaysInMonth,
  getLocaleDateString,
  isFutureDate,
  isSameDate,
  isToday
} from '@/utils/date'

interface CalendarCardProps {
  currentDate: Date
  selectedDate: Date | null
  habits: Habit[]
  records: HabitLog[]
  onNavigateMonth: (direction: 'prev' | 'next') => void
  onSelectDate: (date: Date) => void
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const CalendarCard = ({
  currentDate,
  selectedDate,
  habits,
  records,
  onNavigateMonth,
  onSelectDate
}: CalendarCardProps): JSX.Element => {
  const days = getDaysInMonth(currentDate)
  const monthYear = getLocaleDateString(currentDate)

  const habitIds = new Set(habits.map((h) => h.id))

  const getDayProgress = (date: Date): { completed: number; total: number } => {
    const dateString = formatDate(date)
    // Restrict to the habits shown here (excludes archived habits' lingering logs).
    const dayRecords = records.filter((r) => r.date === dateString && habitIds.has(r.habit_id))
    const completed = dayRecords.filter(
      (r) => r.state === HABIT_STATUS_COMPLETED || r.state === HABIT_STATUS_SKIPPED
    ).length
    // A weekly-goal habit is only "expected" on a given day if it was logged
    // that day; its untouched off days should not make the day look incomplete.
    const total = habits.filter(
      (h) => h.target_per_week == null || dayRecords.some((r) => r.habit_id === h.id)
    ).length
    return { completed, total }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {monthYear}
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onNavigateMonth('prev')}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => onNavigateMonth('next')}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2 mb-4">
          {WEEKDAYS.map((day) => (
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
                  if (!isFutureDate(day)) onSelectDate(day)
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
}
