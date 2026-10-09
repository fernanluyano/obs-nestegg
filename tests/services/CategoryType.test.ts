import { describe, expect, it } from "vitest";
import { categoryPath } from "../../notes/paths";
import { subcategoryTypeLocked } from "../../snapshot/queries";
import { validateSnapshot } from "../../validation/validate";
import { loadedLedger } from "../helpers/ledgerFixture";

const spend = (subcategory: string) =>
	({ account: "Cash Main", date: "2026-10-03", merchant: "", subcategory, amountCents: -100, note: "", tags: [], fromTo: "" });
const typeOf = (ledger: Awaited<ReturnType<typeof loadedLedger>>["ledger"], subcategory: string) =>
	ledger.store.index.typeOf(subcategory);

describe("subcategoryTypeLocked", () => {
	it("locks a used subcategory and only that one", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(spend("Groceries"));
		expect(subcategoryTypeLocked(ledger.snapshot, "Groceries")).toBe(true);
		expect(subcategoryTypeLocked(ledger.snapshot, "Restaurants")).toBe(false);
		expect(subcategoryTypeLocked(ledger.snapshot, "Nope")).toBe(false);
	});
});

describe("setSubcategoryType", () => {
	it("changes one subcategory and leaves its neighbours alone", async () => {
		const { ledger } = await loadedLedger();
		await ledger.categories.setSubcategoryType("Restaurants", "income");
		expect(typeOf(ledger, "Restaurants")).toBe("income");
		expect(typeOf(ledger, "Groceries")).toBe("expense");
		expect(typeOf(ledger, "Food - Misc")).toBe("expense");
	});

	it("makes a subcategory usable for its new type", async () => {
		const { ledger } = await loadedLedger();
		await ledger.categories.setSubcategoryType("Restaurants", "income");
		await ledger.transactions.add({ ...spend("Restaurants"), amountCents: 500 });
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("rewrites only the Type cell of its row", async () => {
		const { ledger, vault } = await loadedLedger();
		const before = vault.files.get(categoryPath("Food"))!;
		await ledger.categories.setSubcategoryType("Restaurants", "income");
		expect(vault.files.get(categoryPath("Food"))).toBe(before.replace("| Restaurants | expense |", "| Restaurants | income |"));
	});

	it("does nothing when the type is already that", async () => {
		const { ledger, vault } = await loadedLedger();
		const before = vault.files.get(categoryPath("Food"));
		await ledger.categories.setSubcategoryType("Restaurants", "expense");
		expect(vault.files.get(categoryPath("Food"))).toBe(before);
	});

	it("can turn a subcategory into a transfer with no transactions, even under Food", async () => {
		const { ledger } = await loadedLedger();
		await ledger.categories.setSubcategoryType("Restaurants", "transfer");
		expect(typeOf(ledger, "Restaurants")).toBe("transfer");
	});

	it("keeps the planned lines whichever type the subcategory becomes", async () => {
		const { ledger } = await loadedLedger();
		await ledger.budgets.create("2026-10");
		await ledger.budgets.setPlanned("2026-10", "Restaurants", 5000);
		await ledger.categories.setSubcategoryType("Restaurants", "transfer");
		expect(ledger.snapshot.budgets[0].lines.find((l) => l.subcategory === "Restaurants")!.plannedCents).toBe(5000);
	});

	it("refuses a used subcategory, unknown names and unknown types", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(spend("Groceries"));
		await expect(ledger.categories.setSubcategoryType("Groceries", "income")).rejects.toThrow(/still use this subcategory/);
		await expect(ledger.categories.setSubcategoryType("Nope", "expense")).rejects.toThrow(/No subcategory/);
		await expect(ledger.categories.setSubcategoryType("Restaurants", "bogus" as never)).rejects.toThrow(/not a subcategory type/);
		expect(typeOf(ledger, "Groceries")).toBe("expense");
	});

	it("lets Credit card payment change type like any other subcategory", async () => {
		const { ledger } = await loadedLedger();
		await ledger.categories.setSubcategoryType("Credit card payment", "expense");
		expect(typeOf(ledger, "Credit card payment")).toBe("expense");
	});
});
