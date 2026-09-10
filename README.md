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

- Node.js 20+
- On first `npm install`, native modules are rebuilt for Electron
  (`electron-builder install-app-deps`), which needs a working C/C++ toolchain.

## Development

```bash
npm install      # install deps and rebuild native modules
npm run dev       # start the app with hot reload and DevTools
```

## Quality checks

```bash
npm run typecheck   # tsc for the main/preload and renderer projects
npm run lint         # eslint --fix
npm run format       # prettier --write .
```

## Building

```bash
npm run build         # typecheck + bundle
npm run build:win     # Windows NSIS installer
npm run build:mac     # macOS dmg
npm run build:linux   # AppImage / snap / deb
```

## Data location

|             | Path                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Production  | `%APPDATA%/habit-tracker-app/` (Windows), `~/Library/Application Support/habit-tracker-app/` (macOS), `~/.config/habit-tracker-app/` (Linux) |
| Development | same, with a `-dev` suffix on the folder name                                                                                                |

The folder holds `.salt` (the KDF salt) and `database.sqlite` (the encrypted
database). **If you forget your password the data cannot be recovered.**

## Architecture

See [CLAUDE.md](./CLAUDE.md) for a full description of the codebase, data model,
scoring algorithm, and IPC surface.
