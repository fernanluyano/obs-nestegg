import { describe, expect, it } from "vitest";
import {
	accountTypeName,
	addAccountType,
	seedAccountTypes,
	SEED_ASSET_TYPE_NAMES,
	SEED_DEBT_TYPE_NAMES,
	type AccountType,
} from "../accountTypes";

describe("seedAccountTypes", () => {
	it("creates one entry per name, each with a distinct id", () => {
		const result = seedAccountTypes(["Cash/Bank", "Real Estate"]);
		expect(result.map((type) => type.name)).toEqual(["Cash/Bank", "Real Estate"]);
		expect(result[0].id).not.toBe(result[1].id);
	});

	it("matches the documented asset and debt seed lists", () => {
		expect(SEED_ASSET_TYPE_NAMES).toEqual([
			"Cash/Bank",
			"Real Estate",
			"Precious Metals",
			"Retirement",
			"Investments/Brokerage",
			"Vehicle",
		]);
		expect(SEED_DEBT_TYPE_NAMES).toEqual(["Credit Card", "Student Loan", "Auto Loan", "Mortgage", "Other"]);
	});
});

describe("addAccountType", () => {
	it("appends a new type", () => {
		const result = addAccountType([], "Brokerage");
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("Brokerage");
		expect(result[0].id).toBeTruthy();
	});

	it("trims whitespace from the name", () => {
		const result = addAccountType([], "  Brokerage  ");
		expect(result[0].name).toBe("Brokerage");
	});

	it("is a no-op for a blank name", () => {
		const types: AccountType[] = [];
		expect(addAccountType(types, "   ")).toBe(types);
	});

	it("is a no-op for a duplicate name, case-insensitively", () => {
		const types = addAccountType([], "Brokerage");
		expect(addAccountType(types, "brokerage")).toBe(types);
	});

	it("does not mutate the input array", () => {
		const types: AccountType[] = [];
		addAccountType(types, "Brokerage");
		expect(types).toHaveLength(0);
	});

	it("assigns distinct ids across types", () => {
		const result = addAccountType(addAccountType([], "Brokerage"), "Vehicle");
		expect(result[0].id).not.toBe(result[1].id);
	});
});

describe("accountTypeName", () => {
	it("returns the name for a matching id", () => {
		const types = addAccountType([], "Brokerage");
		expect(accountTypeName(types, types[0].id)).toBe("Brokerage");
	});

	it("returns undefined for an id that isn't in the list", () => {
		expect(accountTypeName([], "missing-id")).toBeUndefined();
	});
});
