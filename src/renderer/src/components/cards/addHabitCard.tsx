import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export const AddHabitCard = ({
  habitName,
  setHabitName,
  addHabit
}: {
  habitName: string
  setHabitName: (val: string) => void
  addHabit: () => void
}): JSX.Element => (
  <Card>
    <CardHeader>
      <CardTitle>Add New Habit</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="flex gap-2">
        <Input
          placeholder="Enter habit name..."
          value={habitName}
          onChange={(e) => setHabitName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addHabit()}
        />
        <Button onClick={addHabit}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </CardContent>
  </Card>
)
