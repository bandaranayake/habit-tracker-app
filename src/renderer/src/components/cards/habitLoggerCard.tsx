import { CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Habit } from '@/interfaces/habit'
import { HabitLog } from '@/interfaces/habitLog'
import { HABIT_STATUS_COMPLETED, HABIT_STATUS_MISSED, HABIT_STATUS_SKIPPED } from '@/utils/constant'
import { formatDate, formatDisplayDate, weekKey } from '@/utils/date'

interface HabitLoggerCardProps {
  selectedDate: Date | null
  habits: Habit[]
  records: HabitLog[]
  onUpdateRecord: (habit: Habit, date: string, state: number) => void
  onMarkAllComplete: (date: string) => void
}

const stateButtons = [
  {
    state: HABIT_STATUS_COMPLETED,
    label: '✓',
    title: 'Mark as completed',
    activeClass: 'bg-green-500 border-green-500 text-white',
    idleClass: 'border-gray-300 hover:border-green-400'
  },
  {
    state: HABIT_STATUS_MISSED,
    label: '✗',
    title: 'Mark as missed',
    activeClass: 'bg-red-500 border-red-500 text-white',
    idleClass: 'border-gray-300 hover:border-red-400'
  },
  {
    state: HABIT_STATUS_SKIPPED,
    label: '−',
    title: 'Mark as skipped',
    activeClass: 'bg-yellow-500 border-yellow-500 text-white',
    idleClass: 'border-gray-300 hover:border-yellow-400'
  }
]

export const HabitLoggerCard = ({
  selectedDate,
  habits,
  records,
  onUpdateRecord,
  onMarkAllComplete
}: HabitLoggerCardProps): JSX.Element => {
  const dateString = selectedDate ? formatDate(selectedDate) : ''
  const allComplete =
    habits.length > 0 &&
    habits.every((habit) =>
      records.some(
        (r) =>
          r.habit_id === habit.id && r.date === dateString && r.state === HABIT_STATUS_COMPLETED
      )
    )

  return (
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
              <>
                <div className="flex justify-end pb-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5"
                    disabled={allComplete}
                    onClick={() => onMarkAllComplete(dateString)}
                  >
                    <CheckCheck className="w-4 h-4" />
                    {allComplete ? 'All done' : 'Mark all done'}
                  </Button>
                </div>
                {habits.map((habit) => {
                  const record = records.find(
                    (r) => r.habit_id === habit.id && r.date === dateString
                  )
                  const state = record?.state ?? 0

                  let weekProgress: string | null = null
                  if (habit.target_per_week != null) {
                    const selectedWeek = weekKey(selectedDate)
                    const doneThisWeek = records.filter(
                      (r) =>
                        r.habit_id === habit.id &&
                        r.state === HABIT_STATUS_COMPLETED &&
                        weekKey(new Date(`${r.date}T00:00:00`)) === selectedWeek
                    ).length
                    weekProgress = `${doneThisWeek}/${habit.target_per_week} this week`
                  }

                  return (
                    <div key={habit.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${habit.color}`} />
                        <span className="font-medium">{habit.name}</span>
                        {weekProgress && (
                          <span className="text-xs text-muted-foreground">({weekProgress})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {stateButtons.map((btn) => (
                          <button
                            key={btn.state}
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                              state === btn.state ? btn.activeClass : btn.idleClass
                            }`}
                            onClick={() => onUpdateRecord(habit, dateString, btn.state)}
                            title={btn.title}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </>
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
}
