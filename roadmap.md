# Nestegg roadmap

Goal: one all-around personal finance plugin for Obsidian — budgeting, accounts and net worth, and long-term investments — instead of juggling several tools.

Status: planning. The existing implementation is being discarded (clean slate).

## Decisions

- **Single plugin.** No split into multiple plugins. Obsidian has no plugin dependency mechanism, and the scope isn't expected to outgrow one plugin.
- **Clean slate.** The current code (accounts/snapshots/types and the net-worth view) is deleted and rebuilt. Only the conventions below carry over; the old work stays in git history.
- **Storage: Markdown files in the vault are the source of truth.** Same approach as Penny Wallet and Budget Vault: plain Markdown tables and frontmatter, one file per month for transactions, readable and diffable in git. No JSON store.
- **Table format follows Penny Wallet**, including referring to wallets and categories by name.
- **Money is integer cents** (`...Cents`), including inside the Markdown tables. Parsed straight to cents on load, never through floats. Formatting to a dollar string happens only at render time.
- **USD only.** No per-account currency.
- **Personal use first.** Community-directory release only once it's in good shape; onboarding, docs and mobile polish are not v1 concerns.
- **Stock Valuations integration is out of scope for v1.** Revisit later; the likely meeting point is vault notes rather than a plugin-to-plugin API.

## Project tracking

Work items are tracked in Obsidian with the Project Manager plugin (dotpm), not GitHub Issues. This roadmap holds the plan and decisions; the milestones below are broken into tickets there.

## Development environment

Development happens in the `Dev` vault (`~/Documents/obsidian/Dev`), where this repo is symlinked into `.obsidian/plugins/nestegg`, the same way `obs-stock-valuations` is. Run `make dev` and reload Obsidian to try changes.

## Sources and licensing

| Source | License | How we use it |
| --- | --- | --- |
| Penny Wallet (`~/dev/github/penny-wallet-v2`, fork of twrusstw/penny-wallet) | MIT | Copy code. Keep the MIT notice and attribution (`NOTICE`/`THIRD-PARTY` file and `LICENSE` handling). |
| Budget Vault (`~/dev/github/budget-vault`) | AGPL-3.0-only from 1.11.12 | **Ideas only.** Do not copy code or structure; implement clean-room. Don't copy from its source while writing ours. |
| `~/dev/github/trading` (own code) | Own | Prior art for long-term investment tracking and finances schema. |
| Fidelity Full View | n/a | Inspiration for the consolidated investments view. |

## Conventions that carry over

- Pure logic (calculations, parsing, formatting) lives in standalone modules, unit-tested without the Obsidian API.
- Integer cents everywhere (see above).
- No comments explaining *what*; only *why*.
- Pre-release: reshape persisted data in place; formal schema versions/migrations start once real vaults exist to protect.
- Stack: TypeScript, esbuild, Vitest; use the `make` targets.

`CLAUDE.md` needs updating when the restart begins: it currently says "wealth tracking only — no budget or transaction tracking" and mandates references by id, both of which no longer hold.

## Milestones

### M0 — Reset
- Remove the old implementation; keep the scaffold (build, tests, release script).
- Update `CLAUDE.md` and `README.md` for the new scope and storage decisions.
- Add Penny Wallet's MIT attribution.

### M1 — Penny Wallet port (v1)
Bring over Penny Wallet's feature set, adapted to integer cents in the tables:
- Transactions: expense, income, transfer (including credit card payments); refunds as negative expenses.
- Accounts: cash, bank, credit card (card balance tracked as debt).
- Custom expense/income categories; tags.
- Transaction list with type/wallet/category/date/keyword filters and subtotals.
- Monthly overview: income/expense summary, 6-month chart, category pies.
- Assets view: account balances, net asset trend, savings rate, allocation pie.
- Entry form, including the mobile bottom-sheet pickers and calculator.

Out of v1: i18n, the iOS Shortcuts URI handler (decide later whether to keep them).

### M2 — Budgets
Ideas from Budget Vault, written clean-room:
- Budgets per category per period with live "left / over".
- Dashboard: spending trend vs budget.
- Open question: pay-cycle-aligned periods vs calendar months.

### M3 — Import and categorisation
- CSV bank-statement import with a review step before commit.
- Verify sign conventions where a running balance is present.
- Auto-categorisation rules learned from corrections.
- Dedupe of re-imported rows.

### M4 — Debts, savings, recurring
- Debts: balance, rate, payment, extra payment, paid-off progress (prior art in `trading`'s `debts` and Budget Vault's debts page).
- Savings goals/buckets.
- Subscriptions / recurring expenses.

### M5 — Net worth and investments
- Net worth over time across all accounts (asset/debt balances).
- Investment accounts and holdings, long-term tracking in the spirit of `trading`.
- Consolidated "full view" of accounts and investments, inspired by Fidelity Full View.

### Later
- Stock Valuations integration.
- Exports and a one-note financial report.
- Community-directory release: onboarding, docs, screenshots, mobile polish.
- Optional: i18n, URI handler.

## Open questions

- Exact Markdown table layout for transactions and accounts once Penny Wallet's format is audited against the integer-cents rule (decimal column parsed to cents vs a literal cents column).
- Whether to keep Penny Wallet's i18n and URI handler.
- Pay-cycle budget periods (M2).
- How investments are modeled: holdings and lots vs periodic balance snapshots (M5).
