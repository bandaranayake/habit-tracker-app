import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Habit } from '@/interfaces/habit'

export const HabitCard = ({
  habit,
  removeHabit
}: {
  habit: Habit
  removeHabit: (val: number) => void
}): JSX.Element => (
  <div key={habit.id} className="flex items-center justify-between p-3 border rounded-lg">
    <div className="flex items-center gap-3">
      <div className={`w-4 h-4 rounded-full ${habit.color}`} />
      <div>
        <h3 className="font-medium">{habit.name}</h3>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>Current: {habit.current_streak} days</span>
          <span>Best: {habit.longest_streak} days</span>
          <span>Rate: {habit.completion_rate}%</span>
          <span>Weight: {habit.weight}</span>
        </div>
      </div>
    </div>
    <div className="flex items-center gap-2">
      {habit.current_streak > 0 && (
        <Badge variant="secondary" className="bg-green-100 text-green-800">
          🔥 {habit.current_streak}
        </Badge>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground"
        onClick={() => removeHabit(habit.id)}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  </div>
)
