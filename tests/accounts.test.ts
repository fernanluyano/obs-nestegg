import { describe, expect, it } from "vitest";
import {
	addAccount,
	archiveAccount,
	assetBreakdownByType,
	formatCents,
	latestBalanceCents,
	netWorthAt,
	recordSnapshot,
	renameAccount,
	type Account,
	type Snapshot,
} from "../accounts";
import type { AccountType } from "../accountTypes";

const assetTypes: AccountType[] = [
	{ id: "type-cash", name: "Cash/Bank" },
	{ id: "type-real-estate", name: "Real Estate" },
	{ id: "type-retirement", name: "Retirement" },
];

const debtTypes: AccountType[] = [{ id: "type-mortgage", name: "Mortgage" }];

describe("addAccount", () => {
	it("appends a new, non-archived account with the given type", () => {
		const result = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("Checking");
		expect(result[0].kind).toBe("asset");
		expect(result[0].type).toBe("type-cash");
		expect(result[0].archived).toBe(false);
		expect(result[0].id).toBeTruthy();
	});

	it("is a no-op when the type id isn't in the available types for the kind", () => {
		const accounts: Account[] = [];
		expect(addAccount(accounts, "Mortgage", "debt", "type-cash", debtTypes)).toBe(accounts);
	});

	it("stores aprBps for a debt account when given", () => {
		const result = addAccount([], "Card", "debt", "type-mortgage", debtTypes, 450);
		expect(result[0].aprBps).toBe(450);
	});

	it("omits aprBps when not given", () => {
		const result = addAccount([], "Card", "debt", "type-mortgage", debtTypes);
		expect(result[0].aprBps).toBeUndefined();
	});

	it("ignores aprBps for an asset account", () => {
		const result = addAccount([], "Checking", "asset", "type-cash", assetTypes, 450);
		expect(result[0].aprBps).toBeUndefined();
	});

	it("trims whitespace from the name", () => {
		const result = addAccount([], "  Checking  ", "asset", "type-cash", assetTypes);
		expect(result[0].name).toBe("Checking");
	});

	it("is a no-op for a blank name", () => {
		const accounts: Account[] = [];
		expect(addAccount(accounts, "   ", "asset", "type-cash", assetTypes)).toBe(accounts);
	});

	it("does not mutate the input array", () => {
		const accounts: Account[] = [];
		addAccount(accounts, "Checking", "asset", "type-cash", assetTypes);
		expect(accounts).toHaveLength(0);
	});

	it("assigns distinct ids across accounts", () => {
		const result = addAccount(
			addAccount([], "Checking", "asset", "type-cash", assetTypes),
			"Mortgage",
			"debt",
			"type-mortgage",
			debtTypes
		);
		expect(result[0].id).not.toBe(result[1].id);
	});
});

describe("renameAccount", () => {
	it("renames the matching account and leaves others untouched", () => {
		const accounts = addAccount(
			addAccount([], "Checking", "asset", "type-cash", assetTypes),
			"Mortgage",
			"debt",
			"type-mortgage",
			debtTypes
		);
		const result = renameAccount(accounts, accounts[0].id, "Primary Checking");
		expect(result[0].name).toBe("Primary Checking");
		expect(result[1].name).toBe("Mortgage");
	});

	it("is a no-op when the id doesn't match", () => {
		const accounts = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		const result = renameAccount(accounts, "missing-id", "Primary Checking");
		expect(result[0].name).toBe("Checking");
	});

	it("is a no-op for a blank name", () => {
		const accounts = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		const result = renameAccount(accounts, accounts[0].id, "   ");
		expect(result[0].name).toBe("Checking");
	});

	it("does not mutate the input array", () => {
		const accounts = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		renameAccount(accounts, accounts[0].id, "Primary Checking");
		expect(accounts[0].name).toBe("Checking");
	});
});

describe("archiveAccount", () => {
	it("marks only the matching account as archived", () => {
		const accounts = addAccount(
			addAccount([], "Checking", "asset", "type-cash", assetTypes),
			"Mortgage",
			"debt",
			"type-mortgage",
			debtTypes
		);
		const result = archiveAccount(accounts, accounts[0].id);
		expect(result[0].archived).toBe(true);
		expect(result[1].archived).toBe(false);
	});

	it("is a no-op when the id doesn't match", () => {
		const accounts = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		const result = archiveAccount(accounts, "missing-id");
		expect(result[0].archived).toBe(false);
	});
});

describe("recordSnapshot", () => {
	it("appends a new snapshot for a fresh account+date", () => {
		const result = recordSnapshot([], "acc-1", "2026-01-01", 10000);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ accountId: "acc-1", date: "2026-01-01", balanceCents: 10000 });
		expect(result[0].id).toBeTruthy();
	});

	it("replaces the existing snapshot for the same account+date instead of duplicating", () => {
		const first = recordSnapshot([], "acc-1", "2026-01-01", 10000);
		const result = recordSnapshot(first, "acc-1", "2026-01-01", 12000);
		expect(result).toHaveLength(1);
		expect(result[0].balanceCents).toBe(12000);
		expect(result[0].id).toBe(first[0].id);
	});

	it("keeps snapshots for the same account on different dates distinct", () => {
		const first = recordSnapshot([], "acc-1", "2026-01-01", 10000);
		const result = recordSnapshot(first, "acc-1", "2026-02-01", 11000);
		expect(result).toHaveLength(2);
	});

	it("keeps snapshots for different accounts on the same date distinct", () => {
		const first = recordSnapshot([], "acc-1", "2026-01-01", 10000);
		const result = recordSnapshot(first, "acc-2", "2026-01-01", 5000);
		expect(result).toHaveLength(2);
	});

	it("does not mutate the input array", () => {
		const snapshots: Snapshot[] = [];
		recordSnapshot(snapshots, "acc-1", "2026-01-01", 10000);
		expect(snapshots).toHaveLength(0);
	});
});

describe("latestBalanceCents", () => {
	it("is undefined for an account with no snapshots yet", () => {
		expect(latestBalanceCents([], "acc-1", "2026-01-01")).toBeUndefined();
	});

	it("returns the latest snapshot on or before the given date", () => {
		let snapshots = recordSnapshot([], "acc-1", "2026-01-01", 10000);
		snapshots = recordSnapshot(snapshots, "acc-1", "2026-03-01", 15000);
		expect(latestBalanceCents(snapshots, "acc-1", "2026-02-01")).toBe(10000);
		expect(latestBalanceCents(snapshots, "acc-1", "2026-03-01")).toBe(15000);
	});

	it("ignores snapshots after the given date", () => {
		const snapshots = recordSnapshot([], "acc-1", "2026-03-01", 15000);
		expect(latestBalanceCents(snapshots, "acc-1", "2026-01-01")).toBeUndefined();
	});

	it("ignores snapshots for other accounts", () => {
		const snapshots = recordSnapshot([], "acc-2", "2026-01-01", 10000);
		expect(latestBalanceCents(snapshots, "acc-1", "2026-01-01")).toBeUndefined();
	});
});

describe("netWorthAt", () => {
	it("is zero with no accounts", () => {
		expect(netWorthAt([], [], "2026-01-01")).toBe(0);
	});

	it("is zero for an account with no snapshots yet", () => {
		const accounts = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		expect(netWorthAt(accounts, [], "2026-01-01")).toBe(0);
	});

	it("sums a single asset account's latest balance", () => {
		const accounts = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		const snapshots = recordSnapshot([], accounts[0].id, "2026-01-01", 100000);
		expect(netWorthAt(accounts, snapshots, "2026-01-01")).toBe(100000);
	});

	it("subtracts a debt account's latest balance", () => {
		const accounts = addAccount([], "Mortgage", "debt", "type-mortgage", debtTypes);
		const snapshots = recordSnapshot([], accounts[0].id, "2026-01-01", 300000);
		expect(netWorthAt(accounts, snapshots, "2026-01-01")).toBe(-300000);
	});

	it("nets assets and debts across multiple accounts", () => {
		let accounts = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		accounts = addAccount(accounts, "Mortgage", "debt", "type-mortgage", debtTypes);
		let snapshots = recordSnapshot([], accounts[0].id, "2026-01-01", 500000);
		snapshots = recordSnapshot(snapshots, accounts[1].id, "2026-01-01", 300000);
		expect(netWorthAt(accounts, snapshots, "2026-01-01")).toBe(200000);
	});

	it("uses the latest snapshot on or before the given date, ignoring later ones", () => {
		const accounts = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		let snapshots = recordSnapshot([], accounts[0].id, "2026-01-01", 100000);
		snapshots = recordSnapshot(snapshots, accounts[0].id, "2026-03-01", 150000);
		expect(netWorthAt(accounts, snapshots, "2026-02-01")).toBe(100000);
	});

	it("ignores an account with no snapshot on or before the given date", () => {
		const accounts = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		const snapshots = recordSnapshot([], accounts[0].id, "2026-03-01", 100000);
		expect(netWorthAt(accounts, snapshots, "2026-01-01")).toBe(0);
	});

	it("still counts an archived account's last known balance", () => {
		let accounts = addAccount([], "Old Card", "debt", "type-mortgage", debtTypes);
		const snapshots = recordSnapshot([], accounts[0].id, "2026-01-01", 20000);
		accounts = archiveAccount(accounts, accounts[0].id);
		expect(netWorthAt(accounts, snapshots, "2026-06-01")).toBe(-20000);
	});

	it("reflects a rename with no change to the total (reference by id, not name)", () => {
		const accounts = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		const snapshots = recordSnapshot([], accounts[0].id, "2026-01-01", 100000);
		const renamed = renameAccount(accounts, accounts[0].id, "Primary Checking");
		expect(netWorthAt(renamed, snapshots, "2026-01-01")).toBe(100000);
		expect(snapshots[0].accountId).toBe(renamed[0].id);
	});
});

describe("assetBreakdownByType", () => {
	it("is empty with no accounts", () => {
		expect(assetBreakdownByType([], [], assetTypes, "2026-01-01")).toEqual([]);
	});

	it("groups a single typed account under its type", () => {
		const accounts = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		const snapshots = recordSnapshot([], accounts[0].id, "2026-01-01", 100000);
		expect(assetBreakdownByType(accounts, snapshots, assetTypes, "2026-01-01")).toEqual([
			{ type: "type-cash", label: "Cash/Bank", totalCents: 100000 },
		]);
	});

	it("sums multiple accounts of the same type into one slice", () => {
		let accounts = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		accounts = addAccount(accounts, "Savings", "asset", "type-cash", assetTypes);
		let snapshots = recordSnapshot([], accounts[0].id, "2026-01-01", 100000);
		snapshots = recordSnapshot(snapshots, accounts[1].id, "2026-01-01", 50000);
		expect(assetBreakdownByType(accounts, snapshots, assetTypes, "2026-01-01")).toEqual([
			{ type: "type-cash", label: "Cash/Bank", totalCents: 150000 },
		]);
	});

	it("excludes debt accounts entirely", () => {
		const accounts = addAccount([], "Mortgage", "debt", "type-mortgage", debtTypes);
		const snapshots = recordSnapshot([], accounts[0].id, "2026-01-01", 300000);
		expect(assetBreakdownByType(accounts, snapshots, assetTypes, "2026-01-01")).toEqual([]);
	});

	it("excludes a type with no balance at the given date", () => {
		const accounts = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		expect(assetBreakdownByType(accounts, [], assetTypes, "2026-01-01")).toEqual([]);
	});

	it("excludes an account whose type id has no match in the given assetTypes", () => {
		const accounts = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		const snapshots = recordSnapshot([], accounts[0].id, "2026-01-01", 100000);
		const typesWithoutCash = assetTypes.filter((type) => type.id !== "type-cash");
		expect(assetBreakdownByType(accounts, snapshots, typesWithoutCash, "2026-01-01")).toEqual([]);
	});

	it("sorts slices by total descending", () => {
		let accounts = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		accounts = addAccount(accounts, "House", "asset", "type-real-estate", assetTypes);
		let snapshots = recordSnapshot([], accounts[0].id, "2026-01-01", 50000);
		snapshots = recordSnapshot(snapshots, accounts[1].id, "2026-01-01", 500000);
		expect(assetBreakdownByType(accounts, snapshots, assetTypes, "2026-01-01").map((entry) => entry.type)).toEqual([
			"type-real-estate",
			"type-cash",
		]);
	});

	it("still counts an archived account's last known balance, matching netWorthAt", () => {
		let accounts = addAccount([], "Old 401k", "asset", "type-retirement", assetTypes);
		const snapshots = recordSnapshot([], accounts[0].id, "2026-01-01", 40000);
		accounts = archiveAccount(accounts, accounts[0].id);
		expect(assetBreakdownByType(accounts, snapshots, assetTypes, "2026-06-01")).toEqual([
			{ type: "type-retirement", label: "Retirement", totalCents: 40000 },
		]);
	});

	it("uses the latest snapshot on or before the given date", () => {
		const accounts = addAccount([], "Checking", "asset", "type-cash", assetTypes);
		let snapshots = recordSnapshot([], accounts[0].id, "2026-01-01", 100000);
		snapshots = recordSnapshot(snapshots, accounts[0].id, "2026-03-01", 150000);
		expect(assetBreakdownByType(accounts, snapshots, assetTypes, "2026-02-01")).toEqual([
			{ type: "type-cash", label: "Cash/Bank", totalCents: 100000 },
		]);
	});
});

describe("formatCents", () => {
	it("formats a positive amount with two decimals and a dollar sign", () => {
		expect(formatCents(123456)).toBe("$1,234.56");
	});

	it("formats zero", () => {
		expect(formatCents(0)).toBe("$0.00");
	});

	it("formats a negative amount with the sign before the dollar sign", () => {
		expect(formatCents(-123456)).toBe("-$1,234.56");
	});
});
