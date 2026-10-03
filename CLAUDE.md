# Nestegg

Obsidian plugin for personal finance, right inside the user's vault: budgeting and transactions first, then accounts/net worth, then long-term investments. Single plugin, USD only, personal use first. Being rebuilt from a clean slate — see `roadmap.md` for decisions, milestones and open questions.

## Sources and licensing

- Penny Wallet (`~/dev/github/penny-wallet-v2`, MIT) is the v1 base: code may be copied, keeping its MIT notice and attribution.
- Budget Vault (`~/dev/github/budget-vault`, AGPL-3.0) is **ideas only** — never copy its code or structure; implement clean-room.

## Data

Markdown files in the vault (tables and frontmatter, Penny Wallet's format) are the source of truth — no JSON store. Stock Valuations integration is out of scope for v1.

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
- Records refer to wallets and categories by name, as Penny Wallet's tables do, so renaming one is an explicit cascading rewrite of the files that mention it.
- Every money amount is stored and computed as an integer number of cents (`...Cents` fields), never a float/decimal — including inside the Markdown tables, where it is parsed straight to cents without going through a float. Formatting to a dollar string is a pure display transform applied only at render time — its output is never persisted or fed back into arithmetic. `obs-stock-valuations` had to retrofit this after a money/shares scale bug; this project does it from the start.
- No comments explaining *what* code does; only *why*, for non-obvious constraints or workarounds.
