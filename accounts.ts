import type { AccountType } from "./accountTypes";

export type AccountKind = "asset" | "debt";

export interface Account {
	id: string;
	name: string;
	kind: AccountKind;
	type: string; // AccountType id — asset types and debt types are separate lists, scoped by kind
	// Debt only, uniform across every debt type (matches the trading app's finances
	// prior art, which never makes apr type-conditional). Basis points (100 = 1%),
	// not a float percentage, for the same reason every *Cents field is an integer.
	aprBps?: number;
	archived: boolean;
}

export interface Snapshot {
	id: string;
	accountId: string;
	date: string; // ISO date, YYYY-MM-DD
	balanceCents: number;
}

function generateId(): string {
	return crypto.randomUUID();
}

export function addAccount(
	accounts: Account[],
	name: string,
	kind: AccountKind,
	typeId: string,
	availableTypes: AccountType[],
	aprBps?: number
): Account[] {
	const trimmed = name.trim();
	if (!trimmed) return accounts;
	if (!availableTypes.some((type) => type.id === typeId)) return accounts;
	const account: Account = { id: generateId(), name: trimmed, kind, type: typeId, archived: false };
	if (kind === "debt" && aprBps !== undefined && Number.isFinite(aprBps) && aprBps >= 0) {
		account.aprBps = aprBps;
	}
	return [...accounts, account];
}

export function renameAccount(accounts: Account[], accountId: string, name: string): Account[] {
	const trimmed = name.trim();
	if (!trimmed) return accounts;
	return accounts.map((account) => (account.id === accountId ? { ...account, name: trimmed } : account));
}

export function archiveAccount(accounts: Account[], accountId: string): Account[] {
	return accounts.map((account) => (account.id === accountId ? { ...account, archived: true } : account));
}

// Add-or-replace for a given account+date, so re-entering the same day's
// balance edits it instead of piling up duplicate snapshots.
export function recordSnapshot(
	snapshots: Snapshot[],
	accountId: string,
	date: string,
	balanceCents: number
): Snapshot[] {
	const existingIndex = snapshots.findIndex((s) => s.accountId === accountId && s.date === date);
	if (existingIndex === -1) {
		return [...snapshots, { id: generateId(), accountId, date, balanceCents }];
	}
	const updated = [...snapshots];
	updated[existingIndex] = { ...updated[existingIndex], balanceCents };
	return updated;
}

function latestSnapshotOnOrBefore(snapshots: Snapshot[], accountId: string, date: string): Snapshot | undefined {
	let latest: Snapshot | undefined;
	for (const snapshot of snapshots) {
		if (snapshot.accountId !== accountId || snapshot.date > date) continue;
		if (!latest || snapshot.date > latest.date) latest = snapshot;
	}
	return latest;
}

export function latestBalanceCents(snapshots: Snapshot[], accountId: string, date: string): number | undefined {
	return latestSnapshotOnOrBefore(snapshots, accountId, date)?.balanceCents;
}

// Not filtered by `archived` — an archived account's last recorded balance
// still belongs in the historical total for any date up to and including
// when it was closed out, same as any other account's latest snapshot.
export function netWorthAt(accounts: Account[], snapshots: Snapshot[], date: string): number {
	let totalCents = 0;
	for (const account of accounts) {
		const latest = latestSnapshotOnOrBefore(snapshots, account.id, date);
		if (!latest) continue;
		totalCents += account.kind === "asset" ? latest.balanceCents : -latest.balanceCents;
	}
	return totalCents;
}

export interface AssetTypeBreakdown {
	type: string; // AccountType id
	label: string;
	totalCents: number;
}

// Same latest-snapshot-per-account logic as netWorthAt, grouped by asset type
// instead of summed into one total. Iterates assetTypes (not the accounts) so
// a type's position — and therefore its chart color — stays fixed regardless
// of which types actually have a balance on the given date. An account whose
// type id has no match in assetTypes (e.g. pre-existing data from before type
// was required) has no entry to project onto and silently drops out of the
// breakdown, though it's still counted in netWorthAt's kind-based total.
export function assetBreakdownByType(
	accounts: Account[],
	snapshots: Snapshot[],
	assetTypes: AccountType[],
	date: string
): AssetTypeBreakdown[] {
	const totals = new Map<string, number>();
	for (const account of accounts) {
		if (account.kind !== "asset") continue;
		const latest = latestSnapshotOnOrBefore(snapshots, account.id, date);
		if (!latest) continue;
		totals.set(account.type, (totals.get(account.type) ?? 0) + latest.balanceCents);
	}
	return assetTypes
		.map((type) => ({ type: type.id, label: type.name, totalCents: totals.get(type.id) ?? 0 }))
		.filter((entry) => entry.totalCents !== 0)
		.sort((a, b) => b.totalCents - a.totalCents);
}

export function formatCents(cents: number): string {
	const formatted = (Math.abs(cents) / 100).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	return cents < 0 ? `-$${formatted}` : `$${formatted}`;
}
