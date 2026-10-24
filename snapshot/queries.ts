import { balanceAt, currentBalance, netAssetCents } from "../domain/accounts";
import { bucketsTotal, type Bucket } from "../domain/buckets";
import { monthEndKey, monthOf } from "../domain/dates";
import { DEFAULT_TAGS } from "../domain/defaults";
import { loanDebt, type LoanDebt } from "../domain/loans";
import { summarize } from "../domain/transactions";
import type { CategoryIndex } from "../domain/categories";
import { isInvesting, isLiability, type Account, type AccountBalance, type LedgerEntry, type MonthSummary } from "../domain/types";
import { assetsByType, assetsTimeline } from "./assetQueries";
import { accountTransactions, categoryIndexOf, entriesOf, type Snapshot } from "./snapshot";

export function accountsOf(snapshot: Snapshot): Account[] {
	return snapshot.accounts.map((a) => a.account);
}

export function activeAccounts(snapshot: Snapshot): Account[] {
	return accountsOf(snapshot).filter((a) => a.active);
}

export function accountColors(snapshot: Snapshot): Map<string, string> {
	return new Map(accountsOf(snapshot).map((a) => [a.name, a.color]));
}

export function findAccount(snapshot: Snapshot, name: string): Account | undefined {
	return accountsOf(snapshot).find((a) => a.name === name);
}

// Balances are recomputed from the rows rather than read from the cached property, so views are
// right even when a bug or sync conflict has left the cache stale.
export function accountBalances(snapshot: Snapshot): AccountBalance[] {
	return accountsOf(snapshot).map((account) => ({
		account,
		balanceCents: currentBalance(account, accountTransactions(snapshot, account.name)),
	}));
}

// Active loans only; credit cards and archived loans are left out.
export function loanDebts(snapshot: Snapshot, today: string): LoanDebt[] {
	return accountBalances(snapshot)
		.filter(({ account }) => account.accountType === "loan" && account.active)
		.map(({ account, balanceCents }) => loanDebt(account, balanceCents, today));
}

export interface CardDebt {
	account: Account;
	owedCents: number; // positive; debts are stored negative, and a card in credit owes nothing
}

// Active credit cards only, with what each owes now.
export function creditCardDebts(snapshot: Snapshot): CardDebt[] {
	return accountBalances(snapshot)
		.filter(({ account }) => account.accountType === "creditCard" && account.active)
		.map(({ account, balanceCents }) => ({ account, owedCents: Math.max(0, -balanceCents) }));
}

export function netAsset(snapshot: Snapshot): number {
	return netAssetCents(accountBalances(snapshot));
}

export function monthEntries(snapshot: Snapshot, month: string): LedgerEntry[] {
	return entriesOf(snapshot.months.filter((m) => m.month === month));
}

export function monthSummary(snapshot: Snapshot, month: string, index: CategoryIndex = categoryIndexOf(snapshot)): MonthSummary {
	return summarize(monthEntries(snapshot, month), index);
}

export function monthSummaries(snapshot: Snapshot, months: string[]): Map<string, MonthSummary> {
	const index = categoryIndexOf(snapshot);
	return new Map(months.map((m) => [m, monthSummary(snapshot, m, index)]));
}

export function netAssetTimeline(snapshot: Snapshot, months: string[]): Map<string, number> {
	const counted = accountsOf(snapshot).filter((a) => a.includeInNetAsset);
	return new Map(
		months.map((month) => {
			const balances = counted.map((account) => ({
				account,
				balanceCents: balanceAt(account, accountTransactions(snapshot, account.name), monthEndKey(month)),
			}));
			return [month, netAssetCents(balances)];
		}),
	);
}

export interface NetWorthPoint {
	assetsCents: number; // cash accounts plus the active asset notes
	liabilitiesCents: number; // credit cards plus loans, positive; a card in credit makes it smaller
	netCents: number;
}

// Net worth at each month end. Accounts follow the same includeInNetAsset rule as netAssetTimeline,
// which stays accounts only; the asset notes join here and nowhere else.
export function netWorthTimeline(snapshot: Snapshot, months: string[]): Map<string, NetWorthPoint> {
	const counted = accountsOf(snapshot).filter((a) => a.includeInNetAsset);
	const notes = assetsTimeline(snapshot, months);
	return new Map(
		months.map((month) => {
			let cash = 0;
			let owed = 0;
			for (const account of counted) {
				const balance = balanceAt(account, accountTransactions(snapshot, account.name), monthEndKey(month));
				if (isLiability(account.accountType)) owed -= balance;
				else cash += balance;
			}
			const assetsCents = cash + (notes.get(month) ?? 0);
			return [month, { assetsCents, liabilitiesCents: owed, netCents: assetsCents - owed }];
		}),
	);
}

// Cash on hand at each month end: the cash accounts that count toward net assets, with no asset
// notes and no debt.
export function cashOnHandTimeline(snapshot: Snapshot, months: string[]): Map<string, number> {
	const cash = accountsOf(snapshot).filter((a) => a.includeInNetAsset && a.accountType === "cash");
	return new Map(
		months.map((month) => [
			month,
			cash.reduce((sum, account) => sum + balanceAt(account, accountTransactions(snapshot, account.name), monthEndKey(month)), 0),
		]),
	);
}

// The earliest month any counted cash account has data: its entered balance or a transaction.
export function cashStartMonth(snapshot: Snapshot): string | null {
	const dates = accountsOf(snapshot)
		.filter((a) => a.includeInNetAsset && a.accountType === "cash")
		.flatMap((a) => [a.enteredBalanceAsOf, ...accountTransactions(snapshot, a.name).map((tx) => tx.date)]);
	if (dates.length === 0) return null;
	return monthOf(dates.reduce((min, d) => (d < min ? d : min)));
}

// Everything counted as an asset, by what it is: one entry per asset type, then investing. The keys
// are label keys, so the view needs no change when a type is added. Empty slices are left out.
export function assetsBreakdown(snapshot: Snapshot): Map<string, number> {
	const slices = new Map<string, number>([...assetsByType(snapshot)].map(([type, cents]) => [`label.assetType.${type}`, cents]));
	const investing = investingTotal(snapshot);
	if (investing && investing.cents > 0) slices.set("investing.title", investing.cents);
	return slices;
}

// What the active investing accounts are worth now, all added together; null when there are none.
export function investingTotal(snapshot: Snapshot): { cents: number; count: number } | null {
	const accounts = accountBalances(snapshot).filter(({ account }) => account.active && isInvesting(account.accountType));
	if (accounts.length === 0) return null;
	return { cents: accounts.reduce((sum, a) => sum + a.balanceCents, 0), count: accounts.length };
}

// The earliest month net worth has any data behind it: an account's entered balance or transaction
// (an investing account's first entry), or an active asset's valuation. Null when nothing was ever entered.
export function netWorthStartMonth(snapshot: Snapshot): string | null {
	const dates = [
		...accountsOf(snapshot)
			.filter((a) => a.includeInNetAsset)
			.flatMap((a) =>
				isInvesting(a.accountType)
					? (a.valuations ?? []).map((v) => v.date)
					: [a.enteredBalanceAsOf, ...accountTransactions(snapshot, a.name).map((tx) => tx.date)],
			),
		...snapshot.assets.filter((r) => r.asset.active).flatMap((r) => r.valuations.map((v) => v.date)),
	];
	if (dates.length === 0) return null;
	return monthOf(dates.reduce((min, d) => (d < min ? d : min)));
}

// Sums by category for one type. Expense totals are negated, so refunds net the total down and a
// category is positive when money went out; debt payments count as expense. Transfers and unknown
// subcategories are skipped.
export function groupByCategory(
	entries: LedgerEntry[],
	index: CategoryIndex,
	type: "expense" | "income",
): Map<string, number> {
	const totals = new Map<string, number>();
	for (const entry of entries) {
		const category = index.categoryOf(entry.subcategory);
		const entryType = index.typeOf(entry.subcategory);
		// A debt payment is spending, counted once through its outgoing (negative) row.
		const counts = entryType === type || (type === "expense" && entryType === "debt" && entry.amountCents < 0);
		if (!category || !counts) continue;
		const signed = type === "expense" ? -entry.amountCents : entry.amountCents;
		totals.set(category.name, (totals.get(category.name) ?? 0) + signed);
	}
	return totals;
}

// Expense totals (counted as in groupByCategory) per chosen tag. A row carrying several chosen tags
// counts under each, so the slices can add up to more than the month's spending.
export function groupByTags(entries: LedgerEntry[], index: CategoryIndex, tags: readonly string[]): Map<string, number> {
	const totals = new Map<string, number>();
	for (const entry of entries) {
		const entryType = index.typeOf(entry.subcategory);
		const counts = entryType === "expense" || (entryType === "debt" && entry.amountCents < 0);
		if (!counts) continue;
		for (const tag of tags) {
			if (entry.tags.includes(tag)) totals.set(tag, (totals.get(tag) ?? 0) - entry.amountCents);
		}
	}
	return totals;
}

export function knownTags(snapshot: Snapshot): string[] {
	const tags = new Set(snapshot.months.flatMap((m) => m.transactions.flatMap((tx) => tx.tags)));
	return [...tags].sort();
}

// The built-in tags first, then every other tag already used, without repeats.
export function suggestedTags(snapshot: Snapshot): string[] {
	return [...DEFAULT_TAGS, ...knownTags(snapshot).filter((tag) => !DEFAULT_TAGS.includes(tag))];
}

export function knownMerchants(snapshot: Snapshot): string[] {
	const merchants = new Set(snapshot.months.flatMap((m) => m.transactions.map((tx) => tx.merchant)));
	merchants.delete("");
	return [...merchants].sort((a, b) => a.localeCompare(b));
}

export function accountHasTransactions(snapshot: Snapshot, name: string): boolean {
	return snapshot.months.some((m) => m.account === name && m.transactions.length > 0);
}

// A used subcategory keeps its type, or past income and expense totals would silently change meaning.
export function subcategoryTypeLocked(snapshot: Snapshot, subcategory: string): boolean {
	return subcategoryUsage(snapshot, subcategory) > 0;
}

export function subcategoryUsage(snapshot: Snapshot, subcategory: string): number {
	return snapshot.months.reduce((n, m) => n + m.transactions.filter((tx) => tx.subcategory === subcategory).length, 0);
}

export function bucketsOf(snapshot: Snapshot, name: string): Bucket[] {
	return snapshot.accounts.find((a) => a.account.name === name)?.buckets ?? [];
}

export interface AccountAvailability {
	balanceCents: number;
	bucketsCents: number;
	availableCents: number;
}

// Like the balance, computed from the rows and the bucket table rather than read from the cache.
// Only a cash account has anything set aside; any other account's available is its balance.
export function availability(snapshot: Snapshot, name: string): AccountAvailability | undefined {
	const record = snapshot.accounts.find((a) => a.account.name === name);
	if (!record) return undefined;
	const balanceCents = currentBalance(record.account, accountTransactions(snapshot, name));
	const bucketsCents = bucketsTotal(record.buckets);
	return { balanceCents, bucketsCents, availableCents: balanceCents - bucketsCents };
}
