# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**This project uses pnpm** (version pinned via `packageManager`; `corepack enable` fetches it). Do not use npm — there is no `package-lock.json`.

See `README.md` for `dev`, `build*`, and data-location details. Notes beyond it:

- **`pnpm lint` and `pnpm format` mutate files** (`eslint --fix`, `prettier --write`). To check without changing files (what CI does), run `pnpm exec eslint . --ext .js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts` (no `--fix`) and `pnpm exec prettier --check .`.
- **No test framework** — there are no tests and no `test` script. Don't add or assume one unless asked. The quality gate (exactly what CI runs on every PR) is: `pnpm run typecheck` → eslint check → `pnpm exec prettier --check .` → `pnpm exec electron-vite build`. Use `/verify` to run all four.
- `pnpm run typecheck` covers two separate composite TS projects: `tsconfig.node.json` (main + preload) and `tsconfig.web.json` (renderer).

## Code style

- Prettier enforces: single quotes, **no semicolons**, `printWidth: 100`, no trailing commas, and **`endOfLine: lf`**. `.gitattributes` normalizes every text file to LF; do not commit CRLF.
- ESLint uses the classic `.eslintrc.cjs` (not flat config).
- `src/renderer/src/components/ui/` is vendored shadcn/ui (new-york style, zinc). Do not hand-edit or lint it — regenerate via the shadcn CLI. It is in `.eslintignore`.

## Architecture

- Electron three-process layout under `src/`: `main/` (Node — window, IPC, `db.ts`), `preload/` (context-isolated bridge), `renderer/src/` (React 18 + Tailwind + shadcn/ui).
- Path aliases `@renderer` and `@` both resolve to `src/renderer/src` (set in `electron.vite.config.ts` and `tsconfig.web.json`).
- **`better-sqlite3-multiple-ciphers`** is a native module: marked `external` in the main rollup config (must not be bundled) and rebuilt for Electron's ABI by the `postinstall` step (`electron-builder install-app-deps`), which needs a C/C++ toolchain.
- pnpm blocks dependency build scripts by default. `pnpm-workspace.yaml` allow-lists the ones the app needs (`electron`, `esbuild`, `lzma-native`, `better-sqlite3-multiple-ciphers`) and sets `nodeLinker: hoisted` so electron-builder can resolve native binaries. A new native/binary dep needs adding there or its `pnpm install` is silently skipped.
- **Database has no migration system, by design** — schema changes edit the `initSchema` DDL in `src/main/db.ts` directly (no released versions with user data).
- **Soft deletes**: rows carry a `status` column (`1` = active, `0` = deleted). The DB row interfaces in `src/main/db.ts` intentionally differ from the renderer-facing interfaces in `src/renderer/src/interfaces/`.
- Whole SQLite DB is SQLCipher-encrypted; the key is derived (PBKDF2-SHA256) in the main process and never leaves it. Dev mode uses a separate `<appName>-dev` userData folder.

## Gotchas

- `.npmrc` points Electron / electron-builder binary downloads at `npmmirror.com` (a China mirror); electron-builder.yml hardcodes the same. Downloads may be slow or fail elsewhere. (`.npmrc` holds only those mirror vars; pnpm's own settings are in `pnpm-workspace.yaml`.)
- `build:mac` / `build:linux` skip the typecheck that `build` / `build:win` run.

## Repo etiquette

- Branch names: `feature/<slug>` or `fix/<slug>`. Merge to `main` via GitHub PR (merge commits). CI runs on every PR.
- Commit messages: short imperative summaries; no conventional-commits format.
- Node.js 22.13+ required (the pinned pnpm 11 needs it).

<!-- CLAUDE.md -->

## Work tracking

- Open tasks live in `TODO.md`. Read it when asked what's next;
  tick items off and add follow-ups you discover as you go.
