# Migration tasks

Owned by the `lead` agent. Tasks are in dependency order. Format:

`- [ ] T01 [rust|frontend] <task> (deps: T00) - done when: <check>`

Gates: the frontend gates (typecheck, eslint check, prettier --check, frontend build) apply to every task. The cargo gates (fmt --check, check, clippy -D warnings, test) apply from T03 on. Run `pnpm exec vite build` before cargo, because `generate_context!` needs `dist/`. Contract: `docs/ipc-contract.md`. Background: `MIGRATION.md`.

## Open

- [x] T03 [rust] Scaffold `src-tauri/` for Tauri 2 by hand (no `tauri init` prompts):
  - `Cargo.toml` (lib + bin, `tauri`, `tauri-build`, `serde`, `serde_json`), `build.rs`, `src/main.rs` → `habit_tracker_lib::run()`, `src/lib.rs`, and `.gitignore` (`/target`, `/gen/schemas`).
  - Icons: `pnpm tauri icon resources/icon.png -o src-tauri/icons`.
  - `tauri.conf.json`: productName `Habit Tracker`, `mainBinaryName` `habit-tracker`, version `../package.json`, identifier `com.bandaranayake.habittracker`, the build section from MIGRATION.md (devUrl `http://localhost:5173`, frontendDist `../dist`, `beforeDevCommand: pnpm exec vite`, `beforeBuildCommand: pnpm exec vite build`).
  - Window `main`, 900×670, title `Habit Tracker`, created from config for now.
  - The CSP from the contract, `withGlobalTauri: false`, and bundle targets `nsis`, `app`, `dmg`, `appimage`, `deb`.
  - `capabilities/main.json` for windows `["main"]` with no permissions (or the minimal set that builds).
  - JSON files must pass `prettier --check`.

  (deps: T02) - done when: all four cargo gates and the frontend gates pass, and the capability and conf pass the lead's least-privilege review.

- [x] T04 [rust] `src/error.rs`, `src/db.rs`:
  - `AppError` exactly as in the contract (`Locked`, `Database`, `Io`, serialized as `{kind, message}`).
  - `rusqlite` linked against SQLite3 Multiple Ciphers built from `sqlite3mc-src` (MIGRATION.md Decision 5). The open sequence starts with `PRAGMA cipher = 'sqlcipher'`.
  - Managed state `Db(Mutex<Option<Connection>>)`.
  - The open sequence (`PRAGMA key` with quote escaping, `foreign_keys = ON`, the `sqlite_master` check).
  - The verbatim schema init with the column backfill and the `sort_order` backfill, plus `rekey`.
  - No commands yet.
  - Unit tests on a temp-dir DB: create + reopen with the right key works, the wrong key fails, rekey then reopen with the new key works and the old key fails, and the schema init is idempotent.

  Attempt 1 failed: the vendored OpenSSL build needs a native perl. The engine is now switched. (deps: T03) - done when: the cargo gates pass and the tests listed are present and green.

- [x] T05 [rust] `src/auth.rs`:
  - The data dir (`config_dir()/habit-tracker-app[-dev]`, created if missing).
  - `derive_key` (PBKDF2-HMAC-SHA256, 100 000 iterations, 32 bytes, base64 standard padded) and the 32-byte salt file.
  - The unlock throttle (managed counter, `min(n*500, 5000)` ms, async sleep without holding the DB lock).
  - The commands `salt_exists`, `db_exists`, `create_database`, `unlock_database` and `change_password`, with the exact `DbResult` order and messages from the contract. Register them in `generate_handler!`. The auth commands must be `async`.

  Tests:
  - `derive_key` against a known PBKDF2-SHA256 vector
  - the throttle delay function (0, 1, 10, 11 failures)
  - the password-length check counting UTF-16 units
  - create → unlock → change_password flows on a temp dir via the inner (non-Tauri) functions

  (deps: T04) - done when: the cargo gates pass and all five commands are registered with the contract names.

- [x] T06 [rust] `src/commands.rs`: the 14 data commands with the contract's exact names, args and SQL: `get_all_habits`, `add_habit`, `update_habit`, `set_habit_weight`, `set_habit_target`, `update_habit_details`, `remove_habit`, `reorder_habits`, `archive_habit`, `unarchive_habit`, `get_all_habit_logs`, `update_habit_log`, `get_all_settings`, `set_setting` (14 total). `Habit`/`HabitLog` structs serialize with snake_case column names, `target_per_week: Option<i64>`. Return `Locked` when no connection is open. Register all in `generate_handler!`.

  Tests on a temp DB:
  - `add_habit` returns the id and increments `sort_order`
  - `get_all_habits` hides deleted habits and orders by `sort_order`
  - `remove_habit` soft-deletes the logs
  - the `update_habit_log` upsert re-activates a row
  - `reorder_habits` sets 0-based indices
  - the settings upsert works
  - a locked state yields `Locked`

  (deps: T04) - done when: the cargo gates pass and all 14 commands are registered with the contract names.

- [x] T07 [rust] Window behavior:
  - Set `create: false` on the `main` window in `tauri.conf.json`, and build it in `setup()` via `WebviewWindowBuilder::from_config`.
  - `on_new_window` always denies. For `http` and `https` URLs, open them with `tauri-plugin-opener` from Rust; other schemes are ignored.
  - Call `open_devtools()` only under `cfg(debug_assertions)`.
  - Register the opener plugin, but grant **no** `opener:*` permission in capabilities.
  - Unit-test the URL-scheme filter as a pure function.

  (deps: T03) - done when: the cargo gates pass and `capabilities/main.json` still has no opener, fs, shell or http permission.

- [x] T08 [frontend] Create `src/renderer/src/lib/native.ts`: the only module importing `@tauri-apps/*`. Export `habitAPI` with the same 19 method names and positional signatures as `src/preload/index.d.ts`. Each method calls `invoke('<snake_case>', { camelCaseArgs })` per the contract. Also export the `DbResult`, `AppError` and `AppErrorKind` types. Don't change call sites yet. (deps: T01) - done when: the frontend gates pass and every command name and arg key matches the contract (the lead diffs them).
- [x] T09 [frontend] Migrate every `window.habitAPI` call site to `import { habitAPI } from '@/lib/native'`:
  - `components/LockScreen.tsx`, `components/SettingsView.tsx`, `context/SettingsContext.tsx` and `AuthenticatedApp.tsx`.
  - Drop the `if (window.habitAPI)` guard.
  - The `catch` branches in LockScreen and SettingsView must handle a rejected non-`Error` `AppError` (use `.message` if present).
  - Remove `src/preload/*.d.ts` from the `tsconfig.web.json` include.

  (deps: T08) - done when: `grep -r "window.habitAPI" src/renderer` returns nothing and the frontend gates pass.

- [x] T10 [rust] Full-app build check: from the repo root, `pnpm tauri build --debug --no-bundle` succeeds (it runs `vite build` and compiles the app with the real `dist/`). Fix anything in `src-tauri/` it surfaces. (deps: T05, T06, T07, T09) - done when: that command exits 0 and the cargo gates pass. Verified by the lead (the worker was denied the command): exit 0, `src-tauri/target/debug/habit-tracker.exe`, no tauri config warnings, no file changes needed.
- [x] T11 [frontend] Remove Electron (done except the file deletions and the Vite config rename, which moved to T11b because the worker was denied `git rm`/`git mv`):
  - Delete `src/main/`, `src/preload/`, `electron.vite.config.ts`, `electron-builder.yml` and `.npmrc`. Remove the Electron configs from `.vscode/launch.json` (delete the file if nothing is left).
  - `pnpm remove electron electron-builder electron-rebuild electron-vite @electron-toolkit/preload @electron-toolkit/utils better-sqlite3-multiple-ciphers`. Keep the `@electron-toolkit` eslint and tsconfig presets.
  - Scripts as in MIGRATION.md "Build and CI changes": `dev`, `build`, `build:unpack`, `build:win`, `build:mac` and `build:linux` move to tauri; drop `start` and `postinstall`; remove `"main"`.
  - `tsconfig.node.json`: include `vite.config.ts` only, and drop the `electron-vite/node` types.
  - `pnpm-workspace.yaml`: allowBuilds `esbuild` only, and drop `nodeLinker: hoisted`.
  - Delete the meta CSP from `src/renderer/index.html` (`tauri.conf.json` owns the CSP).
  - Fix Vite's "The CJS build of Vite's Node API is deprecated" warning (found in T10). Rename `vite.config.ts` → `vite.config.mts` and replace `__dirname` with an ESM equivalent (`fileURLToPath(new URL('.', import.meta.url))`). Don't add `"type": "module"`, because `tailwind.config.js` and `postcss.config.js` are CJS. Update the tsconfig include.

  (deps: T10) - done when: `pnpm install --frozen-lockfile` succeeds, `grep -rn "electron" package.json src` only matches the `@electron-toolkit` eslint and tsconfig presets, and the frontend gates pass with `pnpm exec vite build`.

- [x] T11b [frontend] (done except `.npmrc` and `.vscode/launch.json`, see Blocker T11c) Finish the Electron removal: delete the tracked `src/main/`, `src/preload/`, `electron.vite.config.ts`, `electron-builder.yml`, `.npmrc` and `.vscode/launch.json`, and rename `vite.config.ts` → `vite.config.mts` (the content is already ESM-safe; `tsconfig.node.json` includes `vite.config.*`). (deps: T11) - done when: those paths are gone from `git ls-files`, `grep -rn electron src` is empty, `pnpm exec vite build` prints no "CJS build of Vite's Node API" warning, and the frontend gates pass.
- [x] T12 [frontend] Update CI and the README:
  - `.github/workflows/ci.yml`: the build step becomes `pnpm exec vite build`. Add a `rust` job per MIGRATION.md (apt deps `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf build-essential`, `dtolnay/rust-toolchain@stable` with rustfmt and clippy, `Swatinem/rust-cache@v2` with `workspaces: src-tauri`, pnpm install + `pnpm exec vite build`, then cargo fmt --check, clippy -D warnings and test with `--manifest-path src-tauri/Cargo.toml`).
  - `README.md`: Tauri requirements (Rust stable, WebView2 and MSVC build tools on Windows, a C compiler for the bundled SQLite3 Multiple Ciphers; no OpenSSL or Perl), `pnpm dev`/`pnpm build*`, and the unchanged data location.

  (deps: T11) - done when: `ci.yml` parses as YAML (prettier --check passes), it has no `electron-vite` reference, and the frontend gates pass.

Lead follow-up after T11 (done): update the CLAUDE.md Commands, Architecture and Gates sections (`electron-vite build` → `vite build`, `pnpm dev` = `tauri dev`, remove the native-module/postinstall notes).

- [ ] T13 [rust] Fix habit drag-to-reorder (a bug found in the user's manual test). Set `"dragDropEnabled": false` on the `main` window in `src-tauri/tauri.conf.json`. Root cause: Tauri's default `dragDropEnabled: true` replaces WebView2's drag-drop handler, which disables HTML5 drag and drop on Windows (tauri-utils `WindowConfig::drag_drop_enabled` docs). The reorder UI (`habitCard.tsx`) uses HTML5 DnD. The app never accepts OS file drops, so nothing is lost. (deps: T07) - done when: the window config has `dragDropEnabled: false`, it still flows through `WebviewWindowBuilder::from_config`, and the cargo gates, `prettier --check .` and `pnpm tauri build --debug --no-bundle` pass.

## Done

- [x] T01 [frontend] Add Tauri JS packages and tool ignores. Add `@tauri-apps/api@^2` (dependency) and `@tauri-apps/cli@^2` (devDependency) with `pnpm add`. Add the script `"tauri": "tauri"`. Add `src-tauri` to `.eslintignore`, and `src-tauri/target` and `src-tauri/gen` to `.prettierignore`. Leave the Electron scripts untouched. (deps: none) - done when: `pnpm tauri --version` prints 2.x, the lockfile is updated, and all frontend gates pass with `pnpm exec electron-vite build`.
- [x] T11c [frontend] Delete `.npmrc` and `.vscode/launch.json`. This was blocked for the agents by the permission policy; the user deleted both files by hand, and the lead committed the deletion.
- [x] T02 [frontend] Add a standalone `vite.config.ts` (root `src/renderer`, outDir repo-root `dist`, aliases, port 5173 strict) and `connect-src ipc:` in the meta CSP. (deps: T01) - done when: `vite build` writes `dist/` and the gates pass. Verified: same Tailwind classes as the electron-vite CSS (the output is just minified).

## Blockers

<!-- Tasks that failed verification twice: id, error, diagnosis. -->
