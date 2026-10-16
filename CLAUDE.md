# Nestegg

Obsidian plugin for personal finance, right inside the user's vault: budgeting and transactions first, then accounts/net worth, then long-term investments. Single plugin, USD only, personal use first. Being rebuilt from a clean slate. Work is planned and tracked as tickets in the Project Manager kanban board (no GitHub Issues, no roadmap file): tagged `nestegg` under `~/Documents/obsidian/personal/Projects/Personal/_tasks/`, one Markdown note per ticket. Decisions live in the tickets and in this file.

## Sources and licensing

- Some code was inherited from Penny Wallet (MIT) and there is no notice file for it. **Before the first release, all of it must be rewritten so no Penny Wallet code is left** (the mobile calculator, bottom sheets, chart helpers, styles and modal structure are the likeliest places).
- Budget Vault (`~/dev/github/budget-vault`, AGPL-3.0) is **ideas only** — never copy its code or structure; implement clean-room.

## Data

Markdown files in the vault (tables and frontmatter) are the source of truth — no JSON store. One file per month for transactions, readable and diffable in git. Stock Valuations integration is out of scope for v1.

## Development

Develop in the `Dev` vault (`~/Documents/obsidian/Dev`), where this repo is symlinked into `.obsidian/plugins/nestegg` like `obs-stock-valuations`. Run `make dev` and reload Obsidian.

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

Layers, from pure to Obsidian-bound; each folder mirrors a spec folder under `tests/`:

- `domain/` — pure model and rules: types, money, dates, names, categories, accounts (balances), transactions (signs, transfers), entry rules, defaults
- `notes/` — pure note text <-> model: frontmatter reader/patcher, account/category/month/settings notes, paths, kinds/state, transit marking
- `table/` — the Markdown table parser/serializer (own implementation; see the file-structure ticket's POC result)
- `snapshot/` — `buildSnapshot` (notes -> in-memory picture) and read-side `queries` (balances, timelines, summaries, known tags/merchants)
- `validation/` — detectors over a snapshot, `describe` (issue -> text + fix actions)
- `rename/` — rename planners, the stage/validate/swap runner (`execute`) and boot `recovery`
- `storage/` — `VaultPort` (what the plugin needs from the vault), `loader`, folder cleanup, and `ObsidianVault` (the only file that touches the vault API)
- `services/` — `Ledger` facade and the services that write (transactions, accounts, categories, settings, validation fixes); run against `tests/helpers/memoryVault.ts`
- `plugin/` — wiring only: views, commands, startup
- `wizard/` — the setup wizard, the only place to manage accounts, categories and finance preferences (the plugin settings tab holds just the per-device colour theme, stored in `data.json`, never in the vault; themes are data in `domain/themes.ts`, so adding one is a single entry); `wizard/model.ts` holds the pure rules (mandatory pieces, rename impact), `steps/` one file per step
- `view/`, `modal/` — Obsidian UI; keep logic in the pure modules beside them (`view/detail/filters.ts`, `modal/transactionState.ts`, `modal/tagPickerState.ts`)
- `main.ts` — plugin entry point, registered in `manifest.json` by `id`; stays tiny
- `labels.ts` — the English string table
- `styles.css` — plugin styles, loaded automatically by Obsidian
- `.github/workflows/release.yml` — on tag push, builds, tests, verifies the tag matches `manifest.json` version, and drafts a GitHub release with `main.js`/`manifest.json`/`styles.css`
- `scripts/release.sh` — driven by `make release`

Vault layout (all under a fixed `Nestegg/` folder): `Settings.md`, `Accounts/<Name>/<Name>.md`, `Accounts/<Name>/Transactions/YYYY-MM.md`, `Categories/<Category>.md`, `Assets/<Name>.md` (one flat note per asset: a house, a vehicle, metals; frontmatter plus one `Date | ValueCents | Note` table of dated valuations, sorted by date; assets are not accounts and never enter net asset), `Budgets/YYYY-MM.md` (one table of `Subcategory | PlannedCents` per calendar month, planned per subcategory only; a new month copies the previous plan and nothing else carries over). Properties win over paths; every note has `state: current | in_transit`.

Coverage is enforced over every logic layer (see `vitest.config.ts`); only files that call the Obsidian API directly are excluded.

## Conventions

Follow the patterns in the sibling plugin `../obs-stock-valuations` (same author, same toolchain) unless this project's needs diverge:

- Keep pure logic (calculations, formatting, data transforms) in standalone modules separate from `main.ts` and Obsidian-view code, so it can be unit tested without mocking the Obsidian API.
- Persisted data shape changes go through an explicit schema version + migration function, not silent reshaping. **Exception: pre-release** (no version has shipped to users yet, per `manifest.json`/`versions.json`) — reshape the persisted data in place instead; formal migrations start mattering once real user vaults exist to protect.
- Records refer to wallets and categories by name, so renaming one is an explicit cascading rewrite of the files that mention it.
- Every money amount is stored and computed as an integer number of cents (`...Cents` fields), never a float/decimal — including inside the Markdown tables, where the amount column (`AmountCents`) holds the literal integer. Always two decimals (USD); there is no decimal-places setting. Typed dollar input is parsed to cents from its digits, never via `parseFloat(x) * 100`. Formatting to a dollar string is a pure display transform applied only at render time — its output is never persisted or fed back into arithmetic. `obs-stock-valuations` had to retrofit this after a money/shares scale bug; this project does it from the start.
- No comments explaining *what* code does; only *why*, for non-obvious constraints or workarounds.
