# 💰 Nestegg

An [Obsidian](https://obsidian.md) plugin for personal finance, right inside your vault: budgeting and transactions first, then accounts and net worth, then long-term investments.

Data lives in plain Markdown files in your vault (tables and frontmatter), so it stays readable and diffable. USD only.

**Status:** early development, not yet released. The Stock Valuations integration is out of scope for v1.

## ✨ What it does

- **Transactions:** expenses, income, transfers and debt payments, with categories, subcategories, tags and merchants. Bulk edit, filters, and a mobile entry form with a built-in calculator.
- **Budgets:** a planned amount per subcategory for each month, compared against what you spent.
- **Accounts:** cash accounts (with savings buckets), credit cards, loans (with interest, payment schedule and progress) and investing accounts valued by dated entries.
- **Assets:** things you own and value by hand (house, vehicle, metals), tracked over time.
- **Net worth:** assets minus debts, over time and as a breakdown.
- **Setup wizard:** the one place to manage accounts, categories and preferences.
- **Data checks:** a validator that finds damaged or inconsistent notes and offers fixes.

Open them from the command palette: *Open expenses history*, *Open transactions*, *Open budget*, *Open accounts*, *Open net worth*, *Add transaction*, *Set up accounts and categories*, *Validate data* and *Refresh views*.

## 🗂️ How your data is stored

Everything lives under a `Nestegg/` folder at the vault root. The notes are written and managed by the plugin as you make changes, so don't edit them by hand. Run **Validate data** from the command palette if you suspect a note was damaged.

- `Settings.md` — default account and startup validation
- `Accounts/<Name>/<Name>.md` — one note per account (cash, credit card, loan or investing), with its entered balance and date; a cash account also holds its savings buckets, and an investing account its dated entries
- `Accounts/<Name>/Transactions/YYYY-MM.md` — one table of transactions per account per month (not used by investing accounts)
- `Assets/<Name>.md` — one note per asset you own (house, vehicle, metals), with a table of dated valuations
- `Categories/<Category>.md` — one note per category, listing its subcategories
- `Budgets/YYYY-MM.md` — one table of planned amounts per subcategory for each month

Amounts are stored as integer cents. A transaction's amount is signed from its account's point of view, and a transfer or debt payment is two rows, one in each account. Every note carries a `nestegg/...` tag, so you can query them from Obsidian.

The colour theme is a per-device setting kept in the plugin's own `data.json`, not in your vault.

## 📥 Installation

**Manual (development):**

1. Clone this repo into `<your vault>/.obsidian/plugins/nestegg/`
2. `make install && make build`
3. Reload Obsidian and enable **Nestegg** under Settings → Community plugins

## 🛠️ Development

See `CLAUDE.md` for project conventions and the `Makefile` for common commands (`make dev`, `make test`, `make build`).

## 📄 License

MIT. See `LICENSE`.
