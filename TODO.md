# TODO

Work is grouped into feature branches and done one at a time — each branch is
tested and merged before the next starts. Branches are listed in build order.

## Now

- [ ] `feature/habit-lifecycle` — delete safety + archiving
  - [ ] Delete confirmation + undo. `@radix-ui/react-alert-dialog` is already a dependency but unused; deletes are currently immediate and unrecoverable.
  - [ ] Archive vs. delete — stop tracking a habit without losing its history, plus a view of archived habits. (`status = 0` already exists for deletes; add `status = 2` for archived and surface it.)

## Next

- [ ] `feature/logger-enhancements` — faster daily logging
  - [ ] "Mark all done for today" bulk action from the logger.
  - [ ] Notes on a log entry (why a day was skipped/missed). Schema: `note TEXT` on `habit_logs`.
- [ ] `feature/habit-metadata` — organise habits
  - [ ] Habit description / categories / tags. Schema: `description TEXT`, `category TEXT`; filter the habit list by category.
- [ ] `feature/reorder-habits` — user-controlled ordering
  - [ ] Reorder habits with a drag handle (hand-rolled HTML5 drag-and-drop, no new dependency). Schema: `sort_order INTEGER`.
- [ ] `feature/settings` — app preferences
  - [ ] Dark mode toggle — the CSS `.dark` palette exists but nothing sets it.
  - [ ] Settings screen — first day of week (calendar is hard-coded Sunday-first), date format, etc. New `settings` key/value table + a settings context.
- [ ] `feature/change-password` — re-key the database
  - [ ] Change password / re-key the database (`PRAGMA rekey`). Requires a current-password check in the main process.
- [ ] `feature/stats-view` — insights
  - [ ] Stats / insights view — per-habit history, a GitHub-style year heatmap, week/month completion breakdowns. Last, so it can reuse first-day-of-week from `feature/settings`.

## Done

- [x] `feature/habit-goals` — Per-habit goal / target frequency ("N× per week") with score and streak logic that respects it. Off days no longer penalised; weekly-goal habits track streaks in weeks.
