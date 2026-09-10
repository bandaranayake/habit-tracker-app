import { useState } from 'react'
import { Archive, Check, GripVertical, Pencil, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Habit } from '@/interfaces/habit'
import { HABIT_COLORS, HABIT_TARGET_OPTIONS, HABIT_WEIGHTS } from '@/utils/constant'

/** Streaks are counted in days for daily habits and in weeks for weekly goals. */
const streakUnit = (habit: Habit, count: number): string => {
  const unit = habit.target_per_week == null ? 'day' : 'week'
  return count === 1 ? unit : `${unit}s`
}

interface HabitCardProps {
  habit: Habit
  removeHabit: (id: number) => void
  archiveHabit: (id: number) => void
  setHabitWeight: (id: number, weight: number) => void
  setHabitTarget: (id: number, targetPerWeek: number | null) => void
  editHabit: (id: number, name: string, color: string) => void
  /** Hand-rolled HTML5 drag-and-drop reordering, driven by the parent list. */
  isDragging: boolean
  onDragStart: () => void
  onDragEnter: () => void
  onDragEnd: () => void
}

export const HabitCard = ({
  habit,
  removeHabit,
  archiveHabit,
  setHabitWeight,
  setHabitTarget,
  editHabit,
  isDragging,
  onDragStart,
  onDragEnter,
  onDragEnd
}: HabitCardProps): JSX.Element => {
  const [isEditing, setIsEditing] = useState(false)
  const [draftName, setDraftName] = useState(habit.name)
  const [draftColor, setDraftColor] = useState(habit.color)
  // The row is only draggable while the grip handle is held, so the inline
  // selects and buttons keep working normally.
  const [dragEnabled, setDragEnabled] = useState(false)

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
    <div
      draggable={dragEnabled}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={() => {
        setDragEnabled(false)
        onDragEnd()
      }}
      className={`flex items-center justify-between p-3 border rounded-lg bg-card transition-opacity ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          onMouseDown={() => setDragEnabled(true)}
          onMouseUp={() => setDragEnabled(false)}
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className={`w-4 h-4 rounded-full ${habit.color}`} />
        <div>
          <h3 className="font-medium">{habit.name}</h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              Best: {habit.longest_streak} {streakUnit(habit, habit.longest_streak)}
            </span>
            <span>Rate: {habit.completion_rate}%</span>
            <label className="flex items-center gap-1">
              Goal:
              <select
                className="bg-transparent border rounded px-1 py-0.5 text-foreground"
                value={habit.target_per_week ?? ''}
                onChange={(e) =>
                  setHabitTarget(habit.id, e.target.value === '' ? null : Number(e.target.value))
                }
                title="How often you aim to complete this habit"
              >
                {HABIT_TARGET_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value ?? ''}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
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
          <Badge
            variant="secondary"
            className="bg-green-100 text-green-800"
            title={`${habit.current_streak}-${streakUnit(habit, habit.current_streak)} streak`}
          >
            🔥 {habit.current_streak}
            {habit.target_per_week == null ? '' : 'w'}
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
          className="h-8 w-8 p-0"
          onClick={() => archiveHabit(habit.id)}
          title="Archive habit (stop tracking, keep history)"
        >
          <Archive className="w-4 h-4" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground"
              title="Delete habit"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &ldquo;{habit.name}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the habit and its entire history. You can undo for a few seconds
                afterwards. To keep the history, archive it instead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => removeHabit(habit.id)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
