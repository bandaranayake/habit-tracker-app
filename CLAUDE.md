# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**This project uses pnpm** (version pinned via `packageManager`; `corepack enable` fetches it). Do not use npm — there is no `package-lock.json`.

See `README.md` for data-location details. Notes beyond it:

- `pnpm dev` = `tauri dev`: it starts Vite on port 5173 (`strictPort`) and opens the app with DevTools. `pnpm build` = typecheck + `tauri build`. `build:win` (nsis), `build:mac` (app, dmg) and `build:linux` (appimage, deb) pass `--bundles`. `build:unpack` = `--no-bundle`. `pnpm exec vite build` builds only the frontend into `dist/`.
- **`pnpm lint` and `pnpm format` mutate files** (`eslint --fix`, `prettier --write`). To check without changing files (what CI does), run `pnpm exec eslint . --ext .js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts` (no `--fix`) and `pnpm exec prettier --check .`.
- **No JS test framework.** There is no `test` script; don't add one unless asked. Rust has unit tests (`cargo test`). The frontend gate is `pnpm run typecheck` → eslint check → `pnpm exec prettier --check .` → `pnpm exec vite build`. The Rust gate is the four cargo commands under "Gates" below.
- **Run `pnpm exec vite build` before any cargo command.** `tauri::generate_context!` needs `dist/` to exist at compile time.
- `pnpm run typecheck` covers two composite TS projects: `tsconfig.node.json` (the Vite config) and `tsconfig.web.json` (renderer).

## Code style

- Prettier enforces: single quotes, **no semicolons**, `printWidth: 100`, no trailing commas, and **`endOfLine: lf`**. `.gitattributes` normalizes every text file to LF; do not commit CRLF.
- ESLint uses the classic `.eslintrc.cjs` (not flat config).
- `src/renderer/src/components/ui/` is vendored shadcn/ui (new-york style, zinc). Do not hand-edit or lint it — regenerate via the shadcn CLI. It is in `.eslintignore`.

## Architecture

- Tauri v2 layout:
  - `src-tauri/` is the Rust backend: `lib.rs` (builder, window, plugins), `auth.rs` (KDF, salt, unlock throttle, auth commands), `commands.rs` (data commands), `db.rs` (connection and schema) and `error.rs` (`AppError`).
  - `src/renderer/` is the frontend: React 18 + Tailwind + shadcn/ui, with Vite root `src/renderer`.
  - The IPC surface is defined in `docs/ipc-contract.md`. All Tauri access goes through `src/renderer/src/lib/native.ts` (`habitAPI`); nothing else imports `@tauri-apps/*`.
- Path aliases `@renderer` and `@` both resolve to `src/renderer/src` (set in `vite.config.*` and `tsconfig.web.json`).
- **SQLite engine:** SQLite3 Multiple Ciphers, the same engine the Electron app used.
  - `src-tauri/sqlite3mc-sys/` replaces crates.io `libsqlite3-sys` via `[patch.crates-io]` and compiles the amalgamation from `sqlite3mc-src` with `cc`. No OpenSSL or Perl is needed.
  - When bumping `rusqlite`, the patch crate's version and its copied bindings must match the new `libsqlite3-sys`. Otherwise the patch silently stops applying and the DB is unencrypted. The `engine_is_sqlite3mc_with_sqlcipher_cipher` test catches this.
- pnpm blocks dependency build scripts by default. `pnpm-workspace.yaml` allow-lists only `esbuild`. A new native/binary dep needs adding there, or its `pnpm install` script is silently skipped.
- **Database has no migration system, by design.** Schema changes edit the `init_schema` DDL in `src-tauri/src/db.rs` directly (there are no released versions with user data).
- **Soft deletes**: rows carry a `status` column (`1` = active, `0` = deleted, `2` = archived habit). The Rust row structs return every column, and the renderer interfaces in `src/renderer/src/interfaces/` may omit some.
- The whole DB is encrypted (SQLCipher format, `PRAGMA cipher = 'sqlcipher'`). The key is derived in Rust (PBKDF2-SHA256, 100k iterations) and never leaves it. Data lives in `<config_dir>/habit-tracker-app`, and debug builds use `habit-tracker-app-dev`.
- Capabilities (`src-tauri/capabilities/main.json`) grant no permissions. Custom commands need none, and the opener plugin is called only from Rust. The CSP lives in `tauri.conf.json`.

## Gotchas

- `build:mac` / `build:linux` skip the typecheck that `build` / `build:win` run.
- Sync Tauri commands run on the main thread. Keep heavy work (KDF, rekey) in `async` commands with `spawn_blocking`, as `auth.rs` does.

## Repo etiquette

- Branch names: `feature/<slug>` or `fix/<slug>`. Merge to `main` via GitHub PR (merge commits). CI runs on every PR.
- Commit messages: short imperative summaries; no conventional-commits format.
- Node.js 22.13+ required (the pinned pnpm 11 needs it).

<!-- CLAUDE.md -->

## Work tracking

- Open tasks live in `TODO.md`. Read it when asked what's next;
  tick items off and add follow-ups you discover as you go.

## Gates

Run all of these before committing. CI runs the same checks: the frontend job plus the `rust` job.

```
pnpm exec vite build             # run first: cargo needs dist/
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm run typecheck
pnpm exec eslint . --ext .js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts
pnpm exec prettier --check .
```

Full app check: `pnpm tauri build --debug --no-bundle`. When an IPC command changes, update `docs/ipc-contract.md`, the Rust command and `src/renderer/src/lib/native.ts` together. Rust needs a stable toolchain plus the Tauri v2 prerequisites (WebView2 and MSVC build tools on Windows), and a C compiler for SQLite3MC.
