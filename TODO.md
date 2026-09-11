# TODO

Work is grouped into feature branches and done one at a time — each branch is
tested and merged before the next starts. Branches are listed in build order.

## Now

_`feature/reorder-habits` and `feature/settings` done (awaiting test) — `feature/stats-view` is up next._

## Next

- [ ] `feature/stats-view` — insights
  - [ ] Stats / insights view — per-habit history, a GitHub-style year heatmap, week/month completion breakdowns. Last, so it can reuse first-day-of-week from `feature/
- [ ] `feature/logger-enhancements` — Additional notes
  - [ ] Notes on a log entry (why a day was skipped/missed). Schema: `note TEXT` on `habit_logs`.
- [ ] `feature/habit-metadata` — organise habits
  - [ ] Habit description / categories / tags. Schema: `description TEXT`, `category TEXT`; filter the habit list by category.settings`.

## Done

- [x] `feature/settings` — App preferences via a new `settings` key/value table and a renderer `SettingsContext`: theme (light/dark/system, applied through a Tailwind `class` dark mode), first day of week (threaded through the calendar grid and weekly-goal streak math), date format, and change password (SQLCipher `PRAGMA rekey` with a current-password check and a fresh KDF salt). New full-page Settings screen, reached from a header gear button.
- [x] `feature/reorder-habits` — Drag-handle reordering of active habits (hand-rolled HTML5 drag-and-drop, no new dependency). Schema: `sort_order INTEGER`, backfilled from `id`; new habits append.
- [x] `feature/habit-lifecycle` — Delete confirmation dialog + deferred delete with an undo snackbar; archive/unarchive habits (`status = 2`) with a collapsible archived section; "Mark all done" bulk action in the logger.
- [x] `feature/habit-goals` — Per-habit goal / target frequency ("N× per week") with score and streak logic that respects it. Off days no longer penalised; weekly-goal habits track streaks in weeks.
