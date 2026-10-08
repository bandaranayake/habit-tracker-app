# Habit Tracker

A local-first desktop app for tracking daily habits and building consistency.
Built with Tauri, React, and TypeScript. All data is stored in a single
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
- [Rust](https://rustup.rs) (stable)
- The [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for
  your OS (WebView2 and the MSVC build tools on Windows; webkit2gtk and friends
  on Linux). These include the C compiler that builds the bundled SQLite engine.

## Development

```bash
pnpm install   # install deps
pnpm dev       # start the Tauri window with hot reload and DevTools
```

## Quality checks

```bash
pnpm typecheck   # tsc for the Vite config and renderer projects
pnpm lint        # eslint --fix
pnpm format      # prettier --write .

# Rust checks need dist/ to exist, so run `pnpm exec vite build` first
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Building

```bash
pnpm build          # typecheck + all bundles for the current OS
pnpm build:win      # Windows NSIS installer
pnpm build:mac      # macOS app + dmg
pnpm build:linux    # AppImage + deb
pnpm build:unpack   # release binary only, no installer
```

Output goes under `src-tauri/target/release/bundle/` (the unpacked binary is in
`src-tauri/target/release/`).

## Data location

|             | Path                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Production  | `%APPDATA%/habit-tracker-app/` (Windows), `~/Library/Application Support/habit-tracker-app/` (macOS), `~/.config/habit-tracker-app/` (Linux) |
| Development | same, with a `-dev` suffix on the folder name                                                                                                |

The folder holds `.salt` (the KDF salt) and `database.sqlite` (the encrypted
database). **If you forget your password the data cannot be recovered.**
