import { HABIT_STATUS_COMPLETED, HABIT_STATUS_MISSED, HABIT_STATUS_SKIPPED } from '@/utils/constant'
import { formatDisplayDate } from '@/utils/date'
import { HeatmapDay } from '@/utils/stats'

const stateClass = (state: number | null): string => {
  switch (state) {
    case HABIT_STATUS_COMPLETED:
      return 'bg-green-500'
    case HABIT_STATUS_MISSED:
      return 'bg-red-300'
    case HABIT_STATUS_SKIPPED:
      return 'bg-yellow-300'
    default:
      return 'bg-muted'
  }
}

const stateLabel = (state: number | null): string => {
  switch (state) {
    case HABIT_STATUS_COMPLETED:
      return 'Completed'
    case HABIT_STATUS_MISSED:
      return 'Missed'
    case HABIT_STATUS_SKIPPED:
      return 'Skipped'
    default:
      return 'No log'
  }
}

interface YearHeatmapProps {
  weeks: HeatmapDay[][]
}

/** GitHub-style contribution grid: one column per week, one cell per day. */
export const YearHeatmap = ({ weeks }: YearHeatmapProps): JSX.Element => (
  <div className="overflow-x-auto pb-1">
    <div className="inline-flex gap-[3px]">
      {weeks.map((week) => (
        <div key={week[0]?.date} className="flex flex-col gap-[3px]">
          {week.map((day) => (
            <div
              key={day.date}
              className={`w-3 h-3 rounded-sm ${stateClass(day.state)}`}
              title={`${formatDisplayDate(new Date(`${day.date}T00:00:00`))}: ${stateLabel(day.state)}`}
            />
          ))}
        </div>
      ))}
    </div>
  </div>
)
