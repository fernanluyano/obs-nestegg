// Hand-maintained "What's new" copy, one entry per released version. Add a new entry (newest
// first) whenever a version is released via `make release`; nothing here bumps itself.
export interface ChangelogEntry {
	version: string;
	highlights: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
	{
		version: "0.1.0",
		highlights: [
			"🎉 First release. Personal finance inside your vault, USD only, stored as plain Markdown notes under a Nestegg/ folder",
			"💸 Transactions: expenses, income, refunds, transfers and debt payments, with categories, subcategories, tags and merchants. Search, filters, bulk delete and reassign, and a phone entry form with a built-in keypad",
			"📅 Budgets: a planned amount per subcategory for each month, compared against what you spent. A new month copies the previous plan",
			"🏦 Accounts: cash accounts with savings buckets, credit cards, loans with interest, payment schedule and progress, and investing accounts valued by dated entries",
			"🏠 Assets: a house, vehicle or metals valued by hand over time. Assets are tracked on their own and never counted as an account",
			"📈 Net worth: assets minus debts, over time and as a breakdown",
			"🧰 Setup lives in the app: manage accounts in the Accounts tab and categories in the Budget tab. A new vault opens the Accounts tab",
			"🩺 Validate data finds damaged or inconsistent notes and offers fixes, optionally on startup. The plugin settings also hold the per-device colour theme",
		],
	},
];

export function getChangelogEntry(version: string): ChangelogEntry | undefined {
	return CHANGELOG.find((e) => e.version === version);
}
