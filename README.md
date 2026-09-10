# Habit Tracker

A local-first desktop app for tracking daily habits and building consistency.
Built with Electron, React, and TypeScript. All data is stored in a single
password-encrypted SQLite database on your machine — there is no account, no
server, and no network sync.

## Features

- Add habits and mark each day **completed**, **missed**, or **skipped**
- Monthly calendar with per-day progress indicators
- Current streak, longest streak, and completion rate per habit
- Adjustable per-habit **weight** that feeds a yearly "habit score" chart
- Whole database encrypted with SQLCipher; unlocked with a password you choose
  on first launch

## Requirements

- Node.js 22.13+ (required by the pinned pnpm version)
- [pnpm](https://pnpm.io) (the repo pins a version via `packageManager`; run
  `corepack enable` and it is fetched automatically)
- On first `pnpm install`, native modules are rebuilt for Electron
  (`electron-builder install-app-deps`), which needs a working C/C++ toolchain.

## Development

```bash
pnpm install     # install deps and rebuild native modules
pnpm dev          # start the app with hot reload and DevTools
```

## Quality checks

```bash
pnpm typecheck   # tsc for the main/preload and renderer projects
pnpm lint         # eslint --fix
pnpm format       # prettier --write .
```

## Building

```bash
pnpm build            # typecheck + bundle
pnpm build:win        # Windows NSIS installer
pnpm build:mac        # macOS dmg
pnpm build:linux      # AppImage / snap / deb
```

## Data location

|             | Path                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Production  | `%APPDATA%/habit-tracker-app/` (Windows), `~/Library/Application Support/habit-tracker-app/` (macOS), `~/.config/habit-tracker-app/` (Linux) |
| Development | same, with a `-dev` suffix on the folder name                                                                                                |

The folder holds `.salt` (the KDF salt) and `database.sqlite` (the encrypted
database). **If you forget your password the data cannot be recovered.**
