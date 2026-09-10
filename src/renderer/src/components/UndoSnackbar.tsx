import { Button } from '@/components/ui/button'

interface UndoSnackbarProps {
  message: string
  onUndo: () => void
  onDismiss: () => void
}

/**
 * Transient bottom-of-screen bar offering a single undo action. The parent owns
 * the timer that both auto-dismisses this and commits the deferred action.
 */
export const UndoSnackbar = ({ message, onUndo, onDismiss }: UndoSnackbarProps): JSX.Element => (
  <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
    <div className="flex items-center gap-4 rounded-lg border bg-background px-4 py-3 shadow-lg">
      <span className="text-sm">{message}</span>
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onUndo}>
        Undo
      </Button>
      <button
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground text-sm"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  </div>
)
