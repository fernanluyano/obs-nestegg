import { balanceAt, currentBalance, netAssetCents } from "../domain/accounts";
import { monthEndKey } from "../domain/dates";
import { DEFAULT_TAGS } from "../domain/defaults";
import { summarize } from "../domain/transactions";
import type { CategoryIndex } from "../domain/categories";
import type { Account, AccountBalance, LedgerEntry, MonthSummary, TransactionType } from "../domain/types";
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
