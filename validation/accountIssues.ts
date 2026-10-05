import { currentBalance } from "../domain/accounts";
import { accountTransactions, type Snapshot } from "../snapshot/snapshot";
import type {
	AccountBalanceIssue, DuplicateNameIssue, InvalidDefaultAccountIssue, OrphanedAccountIssue,
} from "./issues";

export function detectStaleBalances(snapshot: Snapshot): AccountBalanceIssue[] {
	const issues: AccountBalanceIssue[] = [];
	for (const { path, account } of snapshot.accounts) {
		const actualCents = currentBalance(account, accountTransactions(snapshot, account.name));
		if (actualCents !== account.balanceCents) {
			issues.push({ type: "accountBalance", path, account: account.name, storedCents: account.balanceCents, actualCents });
		}
	}
	return issues;
}

export function detectDuplicateAccounts(snapshot: Snapshot): DuplicateNameIssue[] {
	const byName = new Map<string, string[]>();
	for (const { path, account } of snapshot.accounts) byName.set(account.name, [...(byName.get(account.name) ?? []), path]);
	return [...byName]
		.filter(([, paths]) => paths.length > 1)
		.map(([name, paths]) => ({ type: "duplicateName", kind: "account", name, paths }));
}

// A month file whose account names no account note is never silent: its rows would count in
// no balance, so it is reported with how much data is stranded.
export function detectOrphanedAccounts(snapshot: Snapshot): OrphanedAccountIssue[] {
	const known = new Set(snapshot.accounts.map((a) => a.account.name));
	const orphans = new Map<string, { count: number; months: Set<string> }>();
	for (const m of snapshot.months) {
		if (known.has(m.account)) continue;
		const entry = orphans.get(m.account) ?? { count: 0, months: new Set<string>() };
		entry.count += m.transactions.length;
		entry.months.add(m.month);
		orphans.set(m.account, entry);
	}
	return [...orphans].map(([account, { count, months }]) => ({
		type: "orphanedAccount",
		account,
		transactionCount: count,
		months: [...months].sort(),
	}));
}

export function detectInvalidDefaultAccount(snapshot: Snapshot): InvalidDefaultAccountIssue[] {
	if (!snapshot.settings) return [];
	const { path, settings } = snapshot.settings;
	const usable = snapshot.accounts.some(
		(a) => a.account.name === settings.defaultAccount && a.account.active && a.account.accountType === "cash",
	);
	if (usable || snapshot.accounts.length === 0) return [];
	return [{ type: "invalidDefaultAccount", path, defaultAccount: settings.defaultAccount }];
}
