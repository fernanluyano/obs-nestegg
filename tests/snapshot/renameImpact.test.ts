import { describe, expect, it } from "vitest";
import { accountRenameImpact, categoryRenameImpact, migrationImpact, subcategoryRenameImpact } from "../../snapshot/renameImpact";
import { buildSnapshot } from "../../snapshot/snapshot";
import { account, budgetInput, monthInput, tx, vaultInputs } from "../helpers/fixtures";

describe("migrationImpact", () => {
	const snap = buildSnapshot([
		...vaultInputs({
			months: [
				monthInput("Cash Main", "2026-10", [tx(), tx({ subcategory: "Restaurants" })]),
				monthInput("Cash Main", "2026-09", [tx({ date: "2026-09-02", subcategory: "Restaurants" })]),
				monthInput("Cash Main", "2026-08", [tx({ date: "2026-08-02", subcategory: "Rent" })]),
			],
		}),
		budgetInput("2026-10", [{ subcategory: "Groceries", plannedCents: 1 }]),
		budgetInput("2026-09", [{ subcategory: "Rent", plannedCents: 1 }]),
	]);

	it("counts the month files and budgets that change and the transactions that move", () => {
		expect(migrationImpact(snap, ["Groceries"])).toEqual({ files: 2, transactions: 1 });
		expect(migrationImpact(snap, ["Groceries", "Restaurants"])).toEqual({ files: 3, transactions: 3 });
	});

	it("is zero when nothing uses the subcategories", () => {
		expect(migrationImpact(snap, ["Tolls"])).toEqual({ files: 0, transactions: 0 });
	});
});

describe("rename impact", () => {
	const transferOut = tx({ subcategory: "Account transfer", amountCents: -5000, fromTo: "Savings", merchant: "" });
	const transferIn = tx({ subcategory: "Account transfer", amountCents: 5000, fromTo: "Cash Main", merchant: "" });
	const snap = buildSnapshot(vaultInputs({
		accounts: [account(), account({ name: "Savings" })],
		months: [
			monthInput("Cash Main", "2026-10", [tx(), tx({ note: "b" }), transferOut]),
			monthInput("Cash Main", "2026-09", [tx({ date: "2026-09-02", subcategory: "Food - Misc" })]),
			monthInput("Savings", "2026-10", [transferIn]),
		],
	}));

	it("counts the notes and transactions a subcategory rename touches, including the category note", () => {
		expect(subcategoryRenameImpact(snap, "Groceries")).toEqual({ files: 2, transactions: 2 });
		expect(subcategoryRenameImpact(snap, "Salary")).toEqual({ files: 1, transactions: 0 });
	});

	it("counts a category rename through its Misc subcategory", () => {
		expect(categoryRenameImpact(snap, "Food")).toEqual({ files: 2, transactions: 1 });
		expect(categoryRenameImpact(snap, "Housing")).toEqual({ files: 1, transactions: 0 });
	});

	it("counts an account rename: its note, its months, referencing rows elsewhere, and the settings note", () => {
		expect(accountRenameImpact(snap, "Cash Main")).toEqual({ files: 1 + 2 + 1 + 1, transactions: 4 + 1 });
		expect(accountRenameImpact(snap, "Savings")).toEqual({ files: 1 + 1 + 1, transactions: 1 + 1 });
	});

	it("counts only the account note for an account with nothing in it", () => {
		const lone = buildSnapshot(vaultInputs({ accounts: [account(), account({ name: "Empty" })], months: [] }));
		expect(accountRenameImpact(lone, "Empty")).toEqual({ files: 1, transactions: 0 });
	});
});
