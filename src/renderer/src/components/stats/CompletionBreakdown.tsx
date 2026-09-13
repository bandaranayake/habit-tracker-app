import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PeriodBreakdown } from '@/utils/stats'

interface CompletionBreakdownProps {
  weekly: PeriodBreakdown[]
  monthly: PeriodBreakdown[]
}

/** Toggleable week/month completion-rate bars. */
export const CompletionBreakdown = ({ weekly, monthly }: CompletionBreakdownProps): JSX.Element => {
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const items = period === 'week' ? weekly : monthly

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          variant={period === 'week' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPeriod('week')}
        >
          Weekly
        </Button>
        <Button
          variant={period === 'month' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPeriod('month')}
        >
          Monthly
        </Button>
      </div>
      <div className="space-y-1.5">
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`} className="flex items-center gap-2 text-sm">
            <span className="w-14 shrink-0 text-muted-foreground">{item.label}</span>
            <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
              {item.rate >= 0 && (
                <div
                  className="h-full rounded-full bg-green-500"
                  style={{ width: `${item.rate}%` }}
                />
              )}
            </div>
            <span className="w-10 shrink-0 text-right text-muted-foreground">
              {item.rate < 0 ? '—' : `${item.rate}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
