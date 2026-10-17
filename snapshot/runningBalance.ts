import { monthEndKey } from "../domain/dates";
import { takesTransactions, type Account } from "../domain/types";
import type { Snapshot } from "./snapshot";

export interface AccountMonth {
	totalCents: number;
	days: Map<string, number>;
}

// Row sums per account and day for one month. Cached by month so a balance on any date is a sum
// over cached months instead of a replay of every row; the owner drops months when their rows change.
export class MonthDeltaCache {
	private months = new Map<string, Map<string, AccountMonth>>();

	get(snapshot: Snapshot, month: string): Map<string, AccountMonth> {
		const known = this.months.get(month);
		if (known) return known;
		const built = new Map<string, AccountMonth>();
		for (const record of snapshot.months) {
			if (record.month !== month) continue;
			const entry = built.get(record.account) ?? { totalCents: 0, days: new Map() };
			for (const tx of record.transactions) {
				entry.totalCents += tx.amountCents;
				entry.days.set(tx.date, (entry.days.get(tx.date) ?? 0) + tx.amountCents);
			}
			built.set(record.account, entry);
		}
		this.months.set(month, built);
		return built;
	}

	has(month: string): boolean {
		return this.months.has(month);
	}

	invalidate(months: string[]): void {
		for (const month of months) this.months.delete(month);
	}

	clear(): void {
		this.months.clear();
	}
}

// Sorts before every real date in the month, so it reads as "the day before the 1st".
function startKey(month: string): string {
	return `${month}-00`;
}

// Sum of the account's rows dated after `after` and up to and including `through`.
function sumBetween(snapshot: Snapshot, cache: MonthDeltaCache, account: string, after: string, through: string): number {
	let sum = 0;
	const seen = new Set<string>();
	for (const record of snapshot.months) {
		if (record.account !== account || seen.has(record.month)) continue;
		seen.add(record.month);
		const entry = cache.get(snapshot, record.month).get(account);
		if (!entry) continue;
		if (startKey(record.month) >= after && monthEndKey(record.month) <= through) {
			sum += entry.totalCents;
			continue;
		}
		for (const [date, cents] of entry.days) if (date > after && date <= through) sum += cents;
	}
	return sum;
}

// Balance at the end of `date`, replaying forward or backward from the entered checkpoint.
function balanceThrough(snapshot: Snapshot, cache: MonthDeltaCache, account: Account, date: string): number {
	const base = account.enteredBalanceCents;
	const asOf = account.enteredBalanceAsOf;
	if (date >= asOf) return base + sumBetween(snapshot, cache, account.name, asOf, date);
	return base - sumBetween(snapshot, cache, account.name, date, asOf);
}

// Active accounts only, in snapshot order: archived accounts never show up in the balances.
const activeOf = (snapshot: Snapshot): Account[] => snapshot.accounts.map((a) => a.account).filter((a) => a.active && takesTransactions(a.accountType));

// The accounts whose balances are listed: the chosen ones, or every active account when none is chosen.
export function balanceAccounts(snapshot: Snapshot, chosen: string[]): string[] {
	return activeOf(snapshot).filter((a) => chosen.length === 0 || chosen.includes(a.name)).map((a) => a.name);
}

// Accounts whose month note opts out of the running balance; an account without a note that month stays on.
export function hiddenBalances(snapshot: Snapshot, month: string): Set<string> {
	return new Set(snapshot.months.filter((m) => m.month === month && !m.showBalance).map((m) => m.account));
}

// For each date in `month` that has a row in the listed accounts, the balance of every listed
// account at the end of that date, in account order. Accounts switched off for the month are never replayed.
export function dailyBalances(
	snapshot: Snapshot, cache: MonthDeltaCache, month: string, chosen: string[],
): Map<string, Map<string, number>> {
	const hidden = hiddenBalances(snapshot, month);
	const names = new Set(balanceAccounts(snapshot, chosen).filter((n) => !hidden.has(n)));
	const accounts = activeOf(snapshot).filter((a) => names.has(a.name));
	const monthData = cache.get(snapshot, month);
	const dates = new Set<string>();
	for (const account of accounts) for (const date of monthData.get(account.name)?.days.keys() ?? []) dates.add(date);

	const result = new Map<string, Map<string, number>>([...dates].sort().map((date) => [date, new Map()]));
	for (const account of accounts) {
		const days = monthData.get(account.name)?.days;
		let running = balanceThrough(snapshot, cache, account, startKey(month));
		for (const [date, balances] of result) {
			running += days?.get(date) ?? 0;
			balances.set(account.name, running);
		}
	}
	return result;
}
