import { describe, expect, it } from "vitest";
import { migrateToV3 } from "../migrations";

describe("migrateToV3", () => {
	it("drops a legacy categories field entirely", () => {
		const legacy = { categories: [{ id: "cat-1", name: "Rent", subcategories: [] }] } as Record<string, unknown>;
		const result = migrateToV3(legacy);
		expect(result).not.toHaveProperty("categories");
	});

	it("carries accounts, snapshots, and types forward untouched", () => {
		const accounts = [{ id: "acc-1", name: "Checking", kind: "asset" as const, type: "type-cash", archived: false }];
		const snapshots = [{ id: "snap-1", accountId: "acc-1", date: "2026-01-01", balanceCents: 10000 }];
		const assetTypes = [{ id: "type-cash", name: "Cash/Bank" }];
		const debtTypes = [{ id: "type-mortgage", name: "Mortgage" }];
		const result = migrateToV3({ accounts, snapshots, assetTypes, debtTypes });
		expect(result).toEqual({ accounts, snapshots, assetTypes, debtTypes });
	});

	it("defaults every field to empty when missing entirely", () => {
		const result = migrateToV3({});
		expect(result).toEqual({ accounts: [], snapshots: [], assetTypes: [], debtTypes: [] });
	});
});
