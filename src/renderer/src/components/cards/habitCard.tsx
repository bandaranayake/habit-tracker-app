import { useState } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Habit } from '@/interfaces/habit'
import { HABIT_COLORS, HABIT_WEIGHTS } from '@/utils/constant'

interface HabitCardProps {
  habit: Habit
  removeHabit: (id: number) => void
  setHabitWeight: (id: number, weight: number) => void
  editHabit: (id: number, name: string, color: string) => void
}

export const HabitCard = ({
  habit,
  removeHabit,
  setHabitWeight,
  editHabit
}: HabitCardProps): JSX.Element => {
  const [isEditing, setIsEditing] = useState(false)
  const [draftName, setDraftName] = useState(habit.name)
  const [draftColor, setDraftColor] = useState(habit.color)

  const startEditing = (): void => {
    setDraftName(habit.name)
    setDraftColor(habit.color)
    setIsEditing(true)
  }

  const cancelEditing = (): void => setIsEditing(false)

  const saveEditing = (): void => {
    const name = draftName.trim()
    if (!name) return
    if (name !== habit.name || draftColor !== habit.color) {
      editHabit(habit.id, name, draftColor)
    }
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-3 p-3 border rounded-lg">
        <div className="flex items-center gap-2">
          <Input
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEditing()
              if (e.key === 'Escape') cancelEditing()
            }}
            placeholder="Habit name"
          />
          <Button size="sm" className="h-8 w-8 p-0" onClick={saveEditing} title="Save">
            <Check className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={cancelEditing}
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {HABIT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setDraftColor(color)}
              title={color}
              className={`w-5 h-5 rounded-full ${color} ${
                draftColor === color ? 'ring-2 ring-offset-2 ring-foreground' : ''
              }`}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <div className={`w-4 h-4 rounded-full ${habit.color}`} />
        <div>
          <h3 className="font-medium">{habit.name}</h3>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Best: {habit.longest_streak} days</span>
            <span>Rate: {habit.completion_rate}%</span>
            <label className="flex items-center gap-1">
              Weight:
              <select
                className="bg-transparent border rounded px-1 py-0.5 text-foreground"
                value={habit.weight}
                onChange={(e) => setHabitWeight(habit.id, Number(e.target.value))}
                title="How much this habit counts toward your overall score"
              >
                {HABIT_WEIGHTS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
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
          className="h-8 w-8 p-0"
          onClick={startEditing}
          title="Edit habit"
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground"
          onClick={() => removeHabit(habit.id)}
          title="Delete habit"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
