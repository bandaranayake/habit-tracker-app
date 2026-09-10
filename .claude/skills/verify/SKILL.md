---
name: verify
description: Run the full local quality gate for habit-tracker-app — the same checks CI runs on every PR (typecheck, eslint, prettier check, electron-vite build). Use before committing, opening a PR, or whenever asked to verify changes.
---

Run these four checks in order, from the repo root. They mirror `.github/workflows/ci.yml` exactly. Report which passed and which failed; on failure, show the relevant output.

1. `npm run typecheck` — tsc for both the node (main + preload) and web (renderer) projects.
2. `npx eslint . --ext .js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts` — **no `--fix`**. (`npm run lint` would mutate files; CI does not.)
3. `npx prettier --check .` — fails on any file that isn't CRLF / Prettier-formatted.
4. `npx electron-vite build` — full bundle.

Notes:

- Do not run `npm run lint` or `npm run format` as part of verification — they rewrite files. If step 2 or 3 fails, report the problems; only fix them (via `--fix` / `--write` or by hand) if asked.
- There is no test suite — these four checks are the whole gate.
- If `node_modules` is missing, run `npm ci` first.
