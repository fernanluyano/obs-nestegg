# Net Worth Tracker

Obsidian plugin to track net worth and accounts over time, right inside the user's vault. Wealth tracking only — no budget or transaction tracking. Early scaffold — see `ideas.md` (local, untracked) for the feature backlog.

## Stack

TypeScript, esbuild (bundles `main.ts` -> `main.js`, CJS, `obsidian`/`electron`/CodeMirror externalized), Vitest for tests.

## Commands

- `make install` — npm install
- `make dev` — esbuild in watch mode, unminified with sourcemaps
- `make build` — typecheck (`tsc -noEmit`) then minified production build
- `make typecheck` — `tsc -noEmit -skipLibCheck`
- `make test` / `make test-watch` — vitest
- `make release` — interactive: bump version in `manifest.json`/`package.json`/`versions.json`, build, test, commit, tag, push, watch CI, publish the GitHub release

Prefer these `make` targets over the underlying `npm run <script>` / `npx vitest` — only drop to the raw command when a target doesn't cover what you need.

## Structure

- `main.ts` — plugin entry point (`Plugin` subclass), registered in `manifest.json` by `id`
- `tests/` — Vitest specs, mirroring the root `.ts` files they cover
- `styles.css` — plugin styles, loaded automatically by Obsidian
- `.github/workflows/release.yml` — on tag push, builds, tests, verifies the tag matches `manifest.json` version, and drafts a GitHub release with `main.js`/`manifest.json`/`styles.css`
- `scripts/release.sh` — driven by `make release`

## Conventions

Follow the patterns in the sibling plugin `../obs-stock-valuations` (same author, same toolchain) unless this project's needs diverge:

- Keep pure logic (calculations, formatting, data transforms) in standalone modules separate from `main.ts` and Obsidian-view code, so it can be unit tested without mocking the Obsidian API.
- Persisted data shape changes go through an explicit schema version + migration function, not silent reshaping. **Exception: pre-release** (no version has shipped to users yet, per `manifest.json`/`versions.json`) — reshape the persisted data in place instead; formal migrations start mattering once real user vaults exist to protect.
- Any record that refers to another persisted record (a snapshot's account, an account's type, etc.) stores that reference by id, never by name. Renaming the referenced record must never require cascading updates elsewhere — if it does, something is storing the name instead of the id.
- Every money amount is stored and computed as an integer number of cents (`...Cents` fields, e.g. `Snapshot.balanceCents`), never a float/decimal. Formatting to a dollar string (`formatCents` in `accounts.ts`) is a pure display transform applied only at render time — its output is never persisted or fed back into arithmetic. `obs-stock-valuations` had to retrofit this after a money/shares scale bug; this project does it from the start.
- No comments explaining *what* code does; only *why*, for non-obvious constraints or workarounds.
