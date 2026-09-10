# TODO

## Now

## Next

- [ ] Delete confirmation + undo. @radix-ui/react-alert-dialog is already a dependency but unused; deletes are currently immediate and unrecoverable.
- [ ] Archive vs. delete — a way to stop tracking a habit without losing its history, and a view of archived habits. (status = 0 already exists; nothing surfaces it.)
- [ ] Reorder habits (drag handle); there is no user-controlled ordering today.
- [ ] Dark mode toggle — the CSS .dark palette exists but nothing sets it.
- [ ] Stats / insights view — per-habit history, a GitHub-style year heatmap, week/month completion breakdowns.
- [ ] "Mark all done for today" bulk action from the logger.
- [ ] Notes on a log entry (why a day was skipped/missed).
- [ ] Change password / re-key the database (PRAGMA rekey).
- [ ] Settings screen — first day of week (calendar is hard-coded Sunday-first), date format, etc.
- [ ] Habit description / categories / tags.

## Done

- [x] Per-habit goal / target frequency ("N× per week") with score and streak logic that respects it — off days no longer penalised; weekly-goal habits track streaks in weeks.
