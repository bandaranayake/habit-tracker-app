import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Habit } from '@/interfaces/habit'
import { HabitLog } from '@/interfaces/habitLog'
import { formatTarget } from '@/utils/constant'
import { buildHeatmapWeeks, monthlyBreakdown, weeklyBreakdown } from '@/utils/stats'
import { YearHeatmap } from '@/components/stats/YearHeatmap'
import { CompletionBreakdown } from '@/components/stats/CompletionBreakdown'

/** Trailing weeks shown in the heatmap - a little over a year, GitHub-style. */
const HEATMAP_WEEKS = 53
const WEEKLY_BREAKDOWN_WEEKS = 12

interface StatsViewProps {
  habits: Habit[]
  records: HabitLog[]
  firstDayOfWeek: number
  onBack: () => void
}

/** Per-habit insights: streak/rate summary, a year heatmap, and completion breakdowns. */
export const StatsView = ({
  habits,
  records,
  firstDayOfWeek,
  onBack
}: StatsViewProps): JSX.Element => {
  const [selectedHabitId, setSelectedHabitId] = useState<number | null>(habits[0]?.id ?? null)
  const habit = habits.find((h) => h.id === selectedHabitId) ?? habits[0] ?? null

  const habitRecords = useMemo(
    () => (habit ? records.filter((r) => r.habit_id === habit.id) : []),
    [records, habit]
  )

  const heatmapWeeks = useMemo(
    () => buildHeatmapWeeks(habitRecords, HEATMAP_WEEKS, firstDayOfWeek),
    [habitRecords, firstDayOfWeek]
  )
  const weekly = useMemo(
    () => weeklyBreakdown(habitRecords, WEEKLY_BREAKDOWN_WEEKS, firstDayOfWeek),
    [habitRecords, firstDayOfWeek]
  )
  const monthly = useMemo(
    () => monthlyBreakdown(habitRecords, new Date().getFullYear()),
    [habitRecords]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <h2 className="text-xl font-semibold">Stats</h2>
      </div>

      {habits.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          Add and log a habit to see its stats here.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {habits.map((h) => (
              <Button
                key={h.id}
                variant={habit?.id === h.id ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => setSelectedHabitId(h.id)}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${h.color}`} />
                {h.name}
              </Button>
            ))}
          </div>

          {habit && (
            <>
              <Card>
                <CardContent className="flex flex-wrap gap-x-8 gap-y-4 py-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Current streak</p>
                    <p className="text-lg font-semibold">{habit.current_streak}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Longest streak</p>
                    <p className="text-lg font-semibold">{habit.longest_streak}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Completion rate</p>
                    <p className="text-lg font-semibold">{habit.completion_rate}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Goal</p>
                    <p className="text-lg font-semibold">{formatTarget(habit.target_per_week)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Past year</CardTitle>
                </CardHeader>
                <CardContent>
                  <YearHeatmap weeks={heatmapWeeks} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Completion breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <CompletionBreakdown weekly={weekly} monthly={monthly} />
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
