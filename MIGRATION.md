# Electron → Tauri v2 migration

Owned by the `lead` agent. Phase 1 audit, written 2026-10-08 against commit `857f825`.

## Inventory

### Main process: `src/main/index.ts`

| Concern         | Electron behavior                                                                                                                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| userData path   | `app.setPath('userData', <appData>/<app.name>)` where `app.name` = `habit-tracker-app` (package.json `name`). Dev (`is.dev`) uses `<appData>/habit-tracker-app-dev`. `<appData>` = `%APPDATA%` (Win), `~/Library/Application Support` (mac), `~/.config` (Linux).                        |
| Files           | `<userData>/.salt` (32 raw random bytes), `<userData>/database.sqlite` (SQLCipher DB).                                                                                                                                                                                                   |
| KDF             | `pbkdf2Sync(password, salt, 100_000, 32, 'sha256').toString('base64')`. The base64 string is the SQLCipher **passphrase** (`PRAGMA key = '<base64>'`). It is not a raw key, so SQLCipher runs its own KDF on top.                                                                        |
| Salt            | `getOrCreateSalt()`: reuse `.salt` if present, else write 32 random bytes. `change-password` writes a **fresh** salt only after the rekey succeeds.                                                                                                                                      |
| Password rules  | `MIN_PASSWORD_LENGTH = 8` on create and on the new password in change. Unlock and current password: non-empty only.                                                                                                                                                                      |
| Unlock throttle | Module-level `failedUnlockAttempts`. Before an unlock attempt, if it is > 0, sleep `min(n * 500, 5000)` ms. A failure does `n++`. A successful unlock **or create** resets it to 0. `change-password` neither checks nor touches it. In memory only, reset on restart.                   |
| Window          | 900×670, `show: false` then show on `ready-to-show`, `autoHideMenuBar`, icon on Linux only, `contextIsolation: true`, `nodeIntegration: false`. DevTools auto-open in dev. `optimizer.watchWindowShortcuts`: F12 toggles DevTools in dev, Ctrl/Cmd+R is ignored in prod.                 |
| External links  | `setWindowOpenHandler`: every `window.open` / `target=_blank` is **denied**. If the URL is `http:` or `https:`, it is opened in the OS browser via `shell.openExternal`. Malformed URLs are ignored. There are currently **no** such links in the renderer. This is a defensive handler. |
| App id          | `setAppUserModelId('com.electron.app')` (Electron template default).                                                                                                                                                                                                                     |
| Lifecycle       | Quit when all windows close (except macOS). Re-create the window on macOS `activate`.                                                                                                                                                                                                    |
| IPC             | 19 `ipcMain.handle` channels. See `docs/ipc-contract.md`. No events (main → renderer) are used.                                                                                                                                                                                          |

### Database: `src/main/db.ts` (`better-sqlite3-multiple-ciphers` 12.2.0)

- Pragmas on open: `cipher = 'sqlcipher'` (SQLite3MultipleCiphers picks the SQLCipher v4 scheme), `key = '<base64>'`, `foreign_keys = ON`.
- Key check: `SELECT 1 FROM sqlite_master LIMIT 1` throws on a wrong key.
- Schema (`initSchema`, idempotent `CREATE TABLE IF NOT EXISTS`):
  - `habits(id PK AUTOINCREMENT, name TEXT NN, color TEXT NN, status INTEGER NN, weight REAL DEFAULT 1.0, target_per_week INTEGER NULL, sort_order INTEGER, current_streak INTEGER DEFAULT 0, longest_streak INTEGER DEFAULT 0, completion_rate REAL DEFAULT 0.0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`
  - `habit_logs(id PK AUTOINCREMENT, habit_id INTEGER NN FK→habits ON DELETE CASCADE, date TEXT NN, state INTEGER NN, status INTEGER NN, UNIQUE(habit_id, date))`
  - `settings(key TEXT PK, value TEXT NN)`
  - `ensureColumn` backfills `habits.target_per_week` and `habits.sort_order` on old DBs, then `UPDATE habits SET sort_order = id WHERE sort_order IS NULL`.
- Status values: `0` deleted, `1` active, `2` archived (habits only use 2).
- Queries: see the per-command SQL in `docs/ipc-contract.md`. `removeHabit` soft-deletes the habit **and** its logs in one transaction. `reorderHabits` sets `sort_order = index` in one transaction. `updateHabitLog` upserts on `(habit_id, date)` and re-activates (`status = 1`).
- `verifyKey(path, key)`: opens a **separate** connection, so the live one is untouched. `rekeyDatabase(newKey)`: `PRAGMA rekey` on the live connection.
- `createEncryptedDatabase` / `openEncryptedDatabase` overwrite the module-level `db` handle without closing the old one.

### Preload: `src/preload/index.ts`, `index.d.ts`

`contextBridge.exposeInMainWorld('habitAPI', {...})` with 19 methods mapping 1:1 to the IPC channels (positional args). `index.d.ts` declares `window.habitAPI` and `DbResult { success: boolean; error?: string }`. It imports the renderer's `Habit` and `HabitLog` interfaces.

### Renderer call sites (`window.habitAPI.*`)

| File                          | Methods                                                                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/LockScreen.tsx`   | `saltExists`, `dbExists` (choose create vs unlock mode), `createDatabase`, `unlockDatabase` (destructure `{ success, error }`, also `catch` → `err.message`)                                                                                                  |
| `components/SettingsView.tsx` | `changePassword` (same `DbResult` pattern)                                                                                                                                                                                                                    |
| `context/SettingsContext.tsx` | `getAllSettings`, `setSetting` (×3: theme, firstDayOfWeek, dateFormat)                                                                                                                                                                                        |
| `AuthenticatedApp.tsx`        | `getAllHabits`, `getAllHabitLogs`, `updateHabit` (×2), `addHabit`, `removeHabit`, `archiveHabit`, `unarchiveHabit`, `reorderHabits`, `setHabitWeight`, `setHabitTarget`, `updateHabitDetails`, `updateHabitLog`. It also has an `if (window.habitAPI)` guard. |

All of these are under `src/renderer/src/`. There are no `target=_blank`, `window.open`, `process`, `require` or Node imports in the renderer. Theme follows `matchMedia('(prefers-color-scheme: dark)')`, which works in all three webviews.

### Build and config

- `electron.vite.config.ts`: main (better-sqlite3 external), preload, and renderer (React plugin, aliases `@` and `@renderer` → `src/renderer/src`). Renderer root is `src/renderer/`, entry `index.html` → `/src/main.tsx`. Output goes to `out/`.
- `src/renderer/index.html`: meta CSP `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`.
- `electron-builder.yml`: appId `com.electron.app`, productName `Habit Tracker`, win exe `habit-tracker` + NSIS (desktop shortcut always), mac dmg (template camera/mic/documents/downloads usage strings, entitlements file that doesn't exist in the repo), linux AppImage/snap/deb, icons in `resources/`, and the npmmirror Electron mirror.
- `package.json`: scripts `dev`, `start`, `build`, `build:{unpack,win,mac,linux}` (electron-vite + electron-builder), and `postinstall` (`electron-builder install-app-deps`). Runtime deps include `@electron-toolkit/{preload,utils}` and `better-sqlite3-multiple-ciphers`. Dev deps include `electron`, `electron-builder`, `electron-rebuild` and `electron-vite`. Lint and TS presets come from `@electron-toolkit/{eslint-config-ts,eslint-config-prettier,tsconfig}`.
- `tsconfig.node.json` (main + preload + electron.vite.config, `types: electron-vite/node`), `tsconfig.web.json` (renderer + `src/preload/*.d.ts`).
- `pnpm-workspace.yaml`: `nodeLinker: hoisted`, allowBuilds for `better-sqlite3-multiple-ciphers`, `electron`, `esbuild` and `lzma-native`.
- `.npmrc`: Electron and electron-builder mirror vars only.
- `.github/workflows/ci.yml`: ubuntu, Node 22, pnpm, then typecheck → eslint → prettier --check → `electron-vite build`. No packaging, no Rust.
- `.vscode/launch.json`: electron-vite debug configs.

## Electron → Tauri mapping

| Electron / Node                                                   | Tauri v2 replacement                                                                                                                                   | Notes                                                                                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ipcMain.handle(channel, ...)`                                    | `#[tauri::command]` + `tauri::generate_handler!`                                                                                                       | Names in `snake_case`. See contract.                                                                                                                                     |
| `ipcRenderer.invoke` + `contextBridge` (`window.habitAPI`)        | `invoke` from `@tauri-apps/api/core`, wrapped in one module `src/renderer/src/lib/native.ts` exporting `habitAPI`                                      | Named args (camelCase in JS), not positional. Preload is deleted.                                                                                                        |
| `better-sqlite3-multiple-ciphers` (native Node module)            | `rusqlite` (not bundled) linked against SQLite3 Multiple Ciphers, compiled from the `sqlite3mc-src` amalgamation with `cc`                             | `tauri-plugin-sql` has no encryption. This is the same C engine as Electron, so the on-disk format is identical. Keep `cipher = 'sqlcipher'`. No OpenSSL or Perl needed. |
| `db` module global                                                | `tauri::State<Db>` where `Db(Mutex<Option<rusqlite::Connection>>)`                                                                                     | `None` = locked → `AppError::Locked`.                                                                                                                                    |
| `crypto.pbkdf2Sync`                                               | `pbkdf2` + `sha2` crates (`pbkdf2_hmac::<Sha256>`)                                                                                                     | Same params. Base64 via the `base64` crate (standard alphabet, padded, as Node).                                                                                         |
| `crypto.randomBytes`                                              | `rand` (OS-seeded CSPRNG) or `getrandom`                                                                                                               | 32 bytes.                                                                                                                                                                |
| `fs.existsSync/readFileSync/writeFileSync`                        | `std::fs`                                                                                                                                              | No fs plugin. Files are only touched from Rust.                                                                                                                          |
| `app.getPath('appData')` + `setPath('userData')`                  | `app.path().config_dir()` joined with `habit-tracker-app` or `habit-tracker-app-dev` (`cfg!(debug_assertions)`)                                        | `config_dir` = `%APPDATA%` / `~/Library/Application Support` / `~/.config`, the same as Electron's appData. Not `app_data_dir()`, which is identifier-based.             |
| `is.dev`                                                          | `cfg!(debug_assertions)`                                                                                                                               |                                                                                                                                                                          |
| `setTimeout` throttle delay                                       | `tokio::time::sleep` (re-exported via `tauri::async_runtime`) in an `async` command                                                                    | Counter in managed state (`AtomicU32` or `Mutex<u32>`). Don't hold the DB lock while sleeping.                                                                           |
| `BrowserWindow({900×670})`                                        | `app.windows[0]` in `tauri.conf.json` (label `main`, `create: false`), built in `setup()` with `WebviewWindowBuilder::from_config`                     | `create: false` is needed so `on_new_window` can be attached.                                                                                                            |
| `setWindowOpenHandler` + `shell.openExternal`                     | `WebviewWindowBuilder::on_new_window` → always `Deny`. For `http`/`https` URLs, call `tauri_plugin_opener::OpenerExt::opener().open_url` **from Rust** | No opener permission is granted to JS. The plugin is used only from Rust.                                                                                                |
| `webContents.openDevTools()` in dev                               | `window.open_devtools()` under `#[cfg(debug_assertions)]`                                                                                              | DevTools are compiled out of release builds by default.                                                                                                                  |
| `autoHideMenuBar`                                                 | Tauri default (no menu on Win/Linux)                                                                                                                   |                                                                                                                                                                          |
| `window-all-closed` / `activate`                                  | Tauri default (exits when the last window closes)                                                                                                      | macOS dock re-open isn't replicated. See Decisions.                                                                                                                      |
| Meta CSP in `index.html`                                          | `app.security.csp` in `tauri.conf.json`                                                                                                                | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src ipc: http://ipc.localhost`                                   |
| contextIsolation / nodeIntegration                                | `app.withGlobalTauri: false`, plus a capability for the `main` window only                                                                             | Custom commands need no permission entries.                                                                                                                              |
| `electron-vite` (3 bundles)                                       | plain `vite` (renderer only), `vite.config.ts`                                                                                                         | root `src/renderer`, outDir `../../dist`, port 5173 `strictPort`.                                                                                                        |
| `electron-builder` + `electron-builder.yml`                       | Tauri bundler (`bundle` in `tauri.conf.json`), `pnpm tauri build`                                                                                      | Targets: nsis, dmg/app, appimage, deb. Snap is dropped.                                                                                                                  |
| `postinstall: electron-builder install-app-deps`                  | removed                                                                                                                                                | No native Node modules remain.                                                                                                                                           |
| `resources/icon.{png,ico,icns}`                                   | `src-tauri/icons/*` generated by `pnpm tauri icon resources/icon.png -o src-tauri/icons`                                                               |                                                                                                                                                                          |
| `@electron-toolkit/preload`, `@electron-toolkit/utils`            | removed                                                                                                                                                |                                                                                                                                                                          |
| `@electron-toolkit/eslint-config-*`, `@electron-toolkit/tsconfig` | **kept**                                                                                                                                               | Pure lint and TS presets with no Electron runtime. See Decisions.                                                                                                        |

## Target layout

```
index.html stays at src/renderer/index.html (Vite root = src/renderer)
src/renderer/src/            React app (unchanged layout; aliases @ and @renderer kept)
src/renderer/src/lib/native.ts   the ONLY file importing @tauri-apps/*
vite.config.ts               replaces electron.vite.config.ts
dist/                        Vite output (frontendDist), gitignored
src-tauri/
  Cargo.toml, build.rs, tauri.conf.json, .gitignore (/target, /gen/schemas)
  capabilities/main.json     windows: ["main"], minimal permissions
  icons/
  src/main.rs                calls lib::run()
  src/lib.rs                 builder, setup (window, data dir), generate_handler
  src/error.rs               AppError
  src/db.rs                  connection, schema, queries
  src/auth.rs                KDF, salt, throttle, auth commands
  src/commands.rs            habit/log/settings commands
```

Deleted at the end: `src/main/`, `src/preload/`, `electron.vite.config.ts`, `electron-builder.yml`, `.npmrc`, `out/`, and the Electron entries in `.vscode/launch.json`. (Workers may merge or split Rust modules. Only the contract is binding.)

## Build and CI changes

- `package.json` scripts (final):
  - `dev`: `tauri dev`
  - `build`: `pnpm run typecheck && tauri build`
  - `build:unpack`: `pnpm run typecheck && tauri build --no-bundle`
  - `build:win`: `pnpm run typecheck && tauri build --bundles nsis`
  - `build:mac`: `tauri build --bundles app,dmg`
  - `build:linux`: `tauri build --bundles appimage,deb`
  - `tauri`: `tauri`
  - `typecheck:node`: covers `vite.config.ts` only
  - `start` and `postinstall` are dropped. `lint`, `format` and `typecheck` stay.
- `tauri.conf.json` `build`: `devUrl: http://localhost:5173`, `frontendDist: ../dist`, `beforeDevCommand: pnpm exec vite`, `beforeBuildCommand: pnpm exec vite build`.
- `pnpm-workspace.yaml`: allowBuilds only `esbuild`. Drop `nodeLinker: hoisted`, which was only needed for electron-builder and the native module.
- `.prettierignore`: add `src-tauri/target`, `src-tauri/gen`. `.eslintignore`: add `src-tauri`.
- CI (`ci.yml`): the frontend job switches the build step to `pnpm exec vite build`. A new `rust` job runs on ubuntu-latest:
  - install `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf build-essential`
  - set up the toolchain with `dtolnay/rust-toolchain@stable` (components rustfmt, clippy) and cache with `Swatinem/rust-cache@v2` (workspaces `src-tauri`)
  - set up pnpm and Node, then `pnpm install --frozen-lockfile` and `pnpm exec vite build`, because `generate_context!` needs `dist/` to exist
  - run `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test`, all with `--manifest-path src-tauri/Cargo.toml`
  - There's no bundling in CI, the same as today.
- Gate change: `pnpm exec electron-vite build` → `pnpm exec vite build` once T02 lands. Cargo gates apply from T03 on. Run `pnpm exec vite build` before `cargo check` locally too (frontendDist must exist).

## Risks

1. **OpenSSL build on Windows (happened in T04; the engine was switched, see Decision 5).** `bundled-sqlcipher-vendored-openssl` builds OpenSSL from source with `openssl-src`. On MSVC this needs a **Windows-native perl** (Strawberry Perl). The only perl on this machine is Git's MSYS perl (`/usr/bin/perl`, `x86_64-msys`), which openssl-src rejects. Mitigation: install Strawberry Perl (`winget install StrawberryPerl.StrawberryPerl`) and make sure it is first on PATH for cargo (or set `OPENSSL_SRC_PERL`). Alternative: a prebuilt OpenSSL plus `OPENSSL_DIR` with the plain `bundled-sqlcipher` feature. macOS builds use CommonCrypto automatically only for non-vendored builds. Linux CI has a system perl.
2. **Format compatibility with existing dev DBs.** Largely retired by Decision 5: the engine is the same SQLite3MC code with the same pragmas, so only a SQLite3MC version gap (12.2.0's bundled version vs `sqlite3mc-src` 2.5.1) could matter. SQLite3MC keeps the SQLCipher format stable across versions. This is not verified by automated tests. CLAUDE.md says there are no released user databases, so a mismatch only costs a dev their local DB. Manual check: unlock an Electron-created `database.sqlite` with the Tauri dev build.
3. **CSP nonces vs `'unsafe-inline'`.** Tauri injects nonces and hashes into `script-src`/`style-src` at build time. When a nonce is present, browsers ignore `'unsafe-inline'`, so runtime-injected `<style>` tags would be blocked. React `style={{}}` (CSSOM) is not affected, and Vite emits a CSS file. Recharts and Radix use inline style props. Smoke-test charts, dialogs and dropdowns. If styles break, the fix must not be `dangerousDisableAssetCspModification`. Report back instead.
4. **Webview differences.** The app moves from Chromium to WebView2, WKWebView and WebKitGTK. Watch `<input type="color"|"date">`, scrollbar styling and `backdrop-filter` on WebKitGTK. A Ctrl+R reload in a release build reloads the UI to the lock screen, while the backend stays unlocked. Re-unlocking just replaces the connection, so this is harmless.
5. **Blocking work on the main thread.** PBKDF2 (100k) plus SQLCipher's KDF (256k) take ~100s of ms. The auth commands must be `async` so they don't run on the main thread.
6. **No GUI test available to the lead.** Gates prove compile, lint and unit tests only. The manual smoke checklist is below.
7. **Patched `libsqlite3-sys` must track rusqlite.** `src-tauri/sqlite3mc-sys/` replaces crates.io `libsqlite3-sys` through `[patch.crates-io]`. It has the same name, version (0.38.2) and `links = "sqlite3"`, plus bindings copied from upstream (MIT). When rusqlite is bumped to a new `libsqlite3-sys` version, the patch silently stops applying, and the build falls back to plain SQLite with **no encryption**. Guard: the `engine_is_sqlite3mc_with_sqlcipher_cipher` test fails in that case. Upgrade by bumping the version and re-copying `bindgen_bundled_version.rs` and `error.rs` from the matching upstream release.

### Manual smoke checklist (for the user after the migration)

`pnpm dev`, then go through these steps:

1. Create a password (< 8 chars rejected, mismatch rejected).
2. Add a habit and log days.
3. Reorder, archive, unarchive, delete with undo, then delete for real.
4. Change weight and target, and rename.
5. Change theme, first day of week and date format, then restart. The settings persist.
6. Change the password, restart, and confirm the old password fails and the new one works.
7. Enter 3 wrong passwords and observe the growing delay.
8. Check that the stats heatmap and charts render (CSP).

## Decisions

1. **Data directory unchanged.** It stays `<config_dir>/habit-tracker-app[-dev]`, matching Electron's userData, so existing dev databases and salts are picked up. The Tauri `identifier` is therefore free to change.
2. **Identifier** `com.bandaranayake.habittracker`. `com.electron.app` is a template placeholder, and Tauri warns about identifiers ending in `.app`. productName `Habit Tracker`, `mainBinaryName` `habit-tracker` (Electron's win exe name), version from `../package.json`.
3. **`DbResult` semantics kept.** `create_database`, `unlock_database` and `change_password` resolve to `{ success, error? }` with the exact Electron messages and never reject for expected failures. All other commands reject with `AppError` where Electron's handler would have thrown (for example DB not unlocked).
4. **Unlock does not clobber the live connection on failure.** Electron replaced its handle before the key check. Rust only stores the new connection on success. The UI is unaffected. This only removes a latent bug.
5. **DB engine: SQLite3 Multiple Ciphers via `sqlite3mc-src`, not SQLCipher plus vendored OpenSSL.** _(Revised during T04.)_ The vendored OpenSSL build failed: openssl-src needs a Windows-native perl, only Git's MSYS perl is available, and installing software is outside what the agents may do. SQLite3MC is a single C file that needs only the MSVC/gcc/clang toolchain Tauri already requires, and it is the exact engine the Electron app used. `PRAGMA cipher = 'sqlcipher'` stays, as in Electron.
6. **External links.** Deny all new-window requests and open `http`/`https` in the OS browser from Rust via `tauri-plugin-opener`. JS gets no opener permission. Nothing in the UI uses this today, but the defensive behavior is kept identical.
7. **Capabilities.** One file, `capabilities/main.json`, for window `main` with an empty permission list. The frontend only calls custom commands, which need no permission entries. If tauri-build rejects an empty list, use the smallest set that builds and justify it.
8. **The window shows immediately** (no `show: false`/`ready-to-show` dance). DevTools auto-open only in debug builds. The macOS "re-create window on dock click" behavior is not replicated: Tauri exits when the last window closes on every OS. The Electron build kept the app alive on macOS without a window, and that is not worth extra code.
9. **Packaging.** Snap is dropped (no Tauri bundler support). The template mac usage descriptions (camera, mic, documents, downloads) and the missing entitlements file are dropped (least privilege). NSIS creates its default shortcuts. The Electron `createDesktopShortcut: always` has no exact Tauri equivalent, so we accept the Tauri default.
10. **`@electron-toolkit/eslint-config-ts`, `eslint-config-prettier` and `tsconfig` are kept.** They are config presets with no Electron runtime. Replacing them is churn with no behavior change.
11. **Renderer stays at `src/renderer/`.** This keeps diffs small, and aliases, `components.json` and shadcn paths stay unchanged.
12. **Call sites are migrated before the Electron code is removed** (T09 before T11). Between T09 and T11 the Electron app no longer runs (the renderer calls `invoke`). That's acceptable on this feature branch. Electron code is still deleted only after the Tauri build is verified (T10).
13. **CSP is in `tauri.conf.json`.** Same directives as the Electron meta tag, plus `connect-src ipc: http://ipc.localhost` for Tauri IPC. T02 adds that `connect-src` to the meta tag (harmless under Electron), and T11 deletes the meta tag so there is one source of truth.
14. **No events.** Electron used none, and the contract defines none.
