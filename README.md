# 💰 Nestegg

An [Obsidian](https://obsidian.md) plugin for personal finance, right inside your vault: budgeting and transactions first, then accounts and net worth, then long-term investments.

Data lives in plain Markdown files in your vault (tables and frontmatter), so it stays readable and diffable. USD only.

**Status:** early development, not yet released. The Stock Valuations integration is out of scope for v1.

## ✨ What it does

- **Transactions:** expenses, income, refunds, transfers and debt payments (loan payments are split into principal and interest), with categories, subcategories, tags and merchants. Search, filters, select mode with bulk delete and reassign, and a mobile entry form with a built-in calculator.
- **Overview:** your spending history by category and tag, with clickable pie charts.
- **Budgets:** a planned amount per subcategory for each month, compared against what you spent.
- **Accounts:** cash accounts (with savings buckets), credit cards, loans (with interest, payment schedule and progress) and investing accounts valued by dated entries.
- **Assets:** things you own and value by hand (house, vehicle, metals), tracked over time.
- **Net worth:** assets minus debts, over time and as a breakdown.
- **Setup:** there is no wizard. Accounts (add, edit, archive, delete and the default account) are managed in the Accounts tab and categories in the Budget tab. A new vault opens the Accounts tab so you can add your first cash account. The plugin settings hold the colour theme and *Validate data on startup*.
- **Data checks:** a validator that finds damaged or inconsistent notes and offers fixes.

Open them from the command palette: *Open expenses history*, *Open transactions*, *Open budget*, *Open accounts*, *Open net worth*, *Add transaction*, *Validate data* and *Refresh views*.

## 🚀 Getting started

1. **Add a cash account.** A new vault opens the Accounts tab. Add your checking account with its current balance and today's date. At least one cash account is required, and the last one can't be removed.
2. **Add the rest of your accounts**: credit cards, loans and investing accounts. Credit cards and loans count as debt.
3. **Check your categories** in the fold at the bottom of the Budget tab. A starter set is already there; rename, add or remove to taste.
4. **Record transactions** with *Add transaction* from the command palette.
5. **Plan the month** in the Budget tab by setting an amount per subcategory.

## 📖 How it works

- **Transaction types.** An *expense* takes money out, *income* brings it in, and a *refund* is money coming back under an expense category, so it lowers that category's total. A *transfer* moves money between your cash accounts or pays a credit card. A *debt payment* pays down a loan.
- **Categories and subcategories.** Each transaction has a subcategory, and every category has a Misc one. Budgets are planned per subcategory, and a new month starts as a copy of the previous plan.
- **Tags.** Add free-form tags such as `need` or `want` to any transaction to group spending in other ways.
- **Account balances.** An account's balance is the balance you entered plus the transactions dated after that entry. If it drifts from your bank, use *Correct balance* on the account. It previews the result and can warn you when it doesn't match the balance you know.
- **Savings buckets.** On a cash account, buckets set money aside toward a goal. They don't move money between accounts; they only reduce what is *available*.
- **Loans.** Enter the amount borrowed, term, rate and start date to get a payment schedule and progress. Each payment is split into principal and interest, and you can set an extra monthly payment.
- **Investing accounts and assets.** Neither has transactions. Add a dated value now and then, and the latest one counts. Investing accounts count toward net worth; assets such as a house or car are tracked on their own and don't.
- **Archiving.** Archiving an account or asset hides it from forms but keeps its history. An archived account can be set to count toward net worth or not.
- **Mobile.** Everything works on a phone, with a keypad entry form and slide-up sheets for pickers and filters.

## 🩹 Troubleshooting

- **Something looks wrong or a view is empty:** run *Validate data*. It lists damaged or inconsistent notes and offers a fix for each. It also runs on startup unless you turn that off in the plugin settings.
- **Edited a note by hand or changed files outside Obsidian:** run *Refresh views*.
- **Account shows "Unbalanced":** a past correction didn't match your bank. Look for missing or duplicated transactions, then correct the balance again.
- **Renaming an account or category:** do it from the plugin, not the file explorer. Notes refer to each other by name, and the plugin updates every note that mentions the old one.

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
