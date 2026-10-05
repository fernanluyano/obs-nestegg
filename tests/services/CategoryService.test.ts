import { describe, expect, it } from "vitest";
import { categoryPath } from "../../notes/paths";
import { LedgerError } from "../../services/errors";
import { validateSnapshot } from "../../validation/validate";
import { loadedLedger } from "../helpers/ledgerFixture";

const spend = (subcategory: string) => ({ account: "Cash Main", date: "2026-10-03", merchant: "", subcategory, amountCents: -100, note: "", tags: [], fromTo: "" });
const category = (ledger: Awaited<ReturnType<typeof loadedLedger>>["ledger"], name: string) =>
	ledger.snapshot.categories.find((c) => c.category.name === name)?.category;

describe("createCategory", () => {
	it("creates a note with its own Misc subcategory", async () => {
		const { ledger } = await loadedLedger();
		await ledger.categories.createCategory("Pets", "expense");
		expect(category(ledger, "Pets")).toEqual({ name: "Pets", categoryType: "expense", subcategories: ["Pets - Misc"] });
	});

	it("rejects bad names, duplicates and a taken Misc name", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.categories.createCategory("a/b", "expense")).rejects.toThrow(/valid category name/);
		await expect(ledger.categories.createCategory("Food", "expense")).rejects.toThrow(/already exists/);
		await ledger.categories.addSubcategory("Food", "Pets - Misc");
		await expect(ledger.categories.createCategory("Pets", "expense")).rejects.toThrow(/Pets - Misc/);
	});
});

describe("addSubcategory", () => {
	it("appends a row to the category note", async () => {
		const { ledger } = await loadedLedger();
		await ledger.categories.addSubcategory("Food", "Coffee");
		expect(category(ledger, "Food")!.subcategories).toContain("Coffee");
	});

	it("rejects unknown categories, bad names and names used anywhere", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.categories.addSubcategory("Nope", "X")).rejects.toThrow(/No category/);
		await expect(ledger.categories.addSubcategory("Food", "a|b")).rejects.toThrow(/valid subcategory name/);
		await expect(ledger.categories.addSubcategory("Food", "Salary")).rejects.toThrow(/already exists/);
	});
});

describe("renames", () => {
	it("renames a subcategory across the transactions that use it", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(spend("Groceries"));
		await ledger.categories.renameSubcategory("Groceries", "Supermarket");
		expect(ledger.snapshot.months[0].transactions[0].subcategory).toBe("Supermarket");
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("renames a category together with its Misc subcategory", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.transactions.add(spend("Food - Misc"));
		await ledger.categories.renameCategory("Food", "Eats");
		expect(category(ledger, "Eats")!.subcategories).toContain("Eats - Misc");
		expect(vault.exists(categoryPath("Eats"))).toBe(true);
		expect(ledger.snapshot.months[0].transactions[0].subcategory).toBe("Eats - Misc");
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});
});

describe("removeSubcategory", () => {
	it("removes an unused subcategory", async () => {
		const { ledger } = await loadedLedger();
		await ledger.categories.removeSubcategory("Restaurants");
		expect(category(ledger, "Food")!.subcategories).not.toContain("Restaurants");
	});

	it("refuses Misc, used and unknown subcategories", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(spend("Groceries"));
		await expect(ledger.categories.removeSubcategory("Food - Misc")).rejects.toThrow(/Misc/);
		await expect(ledger.categories.removeSubcategory("Groceries")).rejects.toThrow(/still use/);
		await expect(ledger.categories.removeSubcategory("Nope")).rejects.toThrow(LedgerError);
	});
});

describe("removeCategory", () => {
	it("removes an unused category", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.categories.removeCategory("Lifestyle");
		expect(category(ledger, "Lifestyle")).toBeUndefined();
		expect(vault.trashed).toEqual([categoryPath("Lifestyle")]);
	});

	it("refuses a used or unknown category", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(spend("Groceries"));
		await expect(ledger.categories.removeCategory("Food")).rejects.toThrow(/still use/);
		await expect(ledger.categories.removeCategory("Nope")).rejects.toThrow(/No category/);
	});
});
