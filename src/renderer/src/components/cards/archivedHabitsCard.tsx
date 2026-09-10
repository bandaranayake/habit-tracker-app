import { useState } from 'react'
import { ArchiveRestore, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

interface ArchivedHabitsCardProps {
  habits: Habit[]
  onUnarchive: (id: number) => void
  onDelete: (id: number) => void
}

export const ArchivedHabitsCard = ({
  habits,
  onUnarchive,
  onDelete
}: ArchivedHabitsCardProps): JSX.Element => {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Archived ({habits.length})
      </button>

      {expanded && (
        <Card>
          <CardContent>
            <div className="space-y-3">
              {habits.map((habit) => (
                <div
                  key={habit.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full ${habit.color} opacity-60`} />
                    <div>
                      <h3 className="font-medium">{habit.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Best: {habit.longest_streak} · Rate: {habit.completion_rate}%
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() => onUnarchive(habit.id)}
                      title="Resume tracking this habit"
                    >
                      <ArchiveRestore className="w-4 h-4" />
                      Unarchive
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
                            This removes the habit and its entire history. You can undo for a few
                            seconds afterwards.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(habit.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
