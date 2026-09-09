import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Habit } from '@/interfaces/habit'
import { HabitLog } from '@/interfaces/habitLog'
import { HABIT_STATUS_COMPLETED, HABIT_STATUS_MISSED, HABIT_STATUS_SKIPPED } from '@/utils/constant'
import { formatDate, formatDisplayDate } from '@/utils/date'

interface HabitLoggerCardProps {
  selectedDate: Date | null
  habits: Habit[]
  records: HabitLog[]
  onUpdateRecord: (habit: Habit, date: string, state: number) => void
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
  onUpdateRecord
}: HabitLoggerCardProps): JSX.Element => (
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
              const dateString = formatDate(selectedDate)
              const record = records.find((r) => r.habit_id === habit.id && r.date === dateString)
              const state = record?.state ?? 0
              return (
                <div key={habit.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${habit.color}`} />
                    <span className="font-medium">{habit.name}</span>
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
