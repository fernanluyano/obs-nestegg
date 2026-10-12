# 💰 Nestegg

An [Obsidian](https://obsidian.md) plugin for personal finance, right inside your vault: budgeting and transactions first, then accounts and net worth, then long-term investments.

Data lives in plain Markdown files in your vault (tables and frontmatter), so it stays readable and diffable. USD only.

**Status:** early development. Transactions, accounts, categories and net worth views work; budgeting and investments are not built yet.

## 🗂️ How your data is stored

Everything lives under a `Nestegg/` folder at the vault root. The notes are written and managed by the plugin as you make changes, so don't edit them by hand. Run **Validate data** from the command palette if you suspect a note was damaged.

- `Settings.md` — default account and startup validation
- `Accounts/<Name>/<Name>.md` — one note per account (cash or credit card), with its entered balance and date
- `Accounts/<Name>/Transactions/YYYY-MM.md` — one table of transactions per account per month
- `Assets/<Name>.md` — one note per asset you own (house, vehicle, metals), with a table of dated valuations
- `Categories/<Category>.md` — one note per category, listing its subcategories

Amounts are stored as integer cents. A transaction's amount is signed from its account's point of view, and a transfer is two rows, one in each account. Every note carries a `nestegg/...` tag, so you can query them from Obsidian.

## 📥 Installation

**Manual (development):**

1. Clone this repo into `<your vault>/.obsidian/plugins/nestegg/`
2. `make install && make build`
3. Reload Obsidian and enable **Nestegg** under Settings → Community plugins

## 🛠️ Development

See `CLAUDE.md` for project conventions and the `Makefile` for common commands (`make dev`, `make test`, `make build`).

## 📄 License

MIT. See `LICENSE`.
