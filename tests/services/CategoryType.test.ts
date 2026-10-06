import { describe, expect, it } from "vitest";
import { categoryPath } from "../../notes/paths";
import { categoryTypeChangeProblem } from "../../snapshot/queries";
import { validateSnapshot } from "../../validation/validate";
import { loadedLedger } from "../helpers/ledgerFixture";

const spend = (subcategory: string) =>
	({ account: "Cash Main", date: "2026-10-03", merchant: "", subcategory, amountCents: -100, note: "", tags: [], fromTo: "" });
const typeOf = (ledger: Awaited<ReturnType<typeof loadedLedger>>["ledger"], name: string) =>
	ledger.snapshot.categories.find((c) => c.category.name === name)?.category.categoryType;

describe("categoryTypeChangeProblem", () => {
	it("allows an unused category, locks a used one and the one holding Credit card payment", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(spend("Groceries"));
		expect(categoryTypeChangeProblem(ledger.snapshot, "Lifestyle")).toBeNull();
		expect(categoryTypeChangeProblem(ledger.snapshot, "Food")).toBe("used");
		expect(categoryTypeChangeProblem(ledger.snapshot, "Transfers")).toBe("cardPayment");
		expect(categoryTypeChangeProblem(ledger.snapshot, "Nope")).toBeNull();
	});
});

describe("setCategoryType", () => {
	it("fixes a category created with the wrong type and makes it usable for that type", async () => {
		const { ledger } = await loadedLedger();
		await ledger.categories.createCategory("Utilities", "transfer");
		await ledger.categories.addSubcategory("Utilities", "ElectricityP1");
		await ledger.categories.setCategoryType("Utilities", "expense");

		expect(typeOf(ledger, "Utilities")).toBe("expense");
		await ledger.transactions.add(spend("ElectricityP1"));
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("rewrites only the categoryType line of the note", async () => {
		const { ledger, vault } = await loadedLedger();
		const before = vault.files.get(categoryPath("Lifestyle"))!;
		await ledger.categories.setCategoryType("Lifestyle", "income");
		expect(vault.files.get(categoryPath("Lifestyle"))).toBe(before.replace("categoryType: expense", "categoryType: income"));
	});

	it("does nothing when the type is already that", async () => {
		const { ledger, vault } = await loadedLedger();
		const before = vault.files.get(categoryPath("Lifestyle"));
		await ledger.categories.setCategoryType("Lifestyle", "expense");
		expect(vault.files.get(categoryPath("Lifestyle"))).toBe(before);
	});

	it("drops the planned lines of a category that becomes a transfer, and keeps them for expense to income", async () => {
		const { ledger } = await loadedLedger();
		await ledger.budgets.create("2026-10");
		await ledger.budgets.setPlanned("2026-10", "Lifestyle - Misc", 5000);
		await ledger.budgets.setPlanned("2026-10", "Shopping - Misc", 700);

		await ledger.categories.setCategoryType("Shopping", "income");
		await ledger.categories.setCategoryType("Lifestyle", "transfer");

		const lines = ledger.snapshot.budgets[0].lines;
		expect(lines.find((l) => l.subcategory === "Shopping - Misc")!.plannedCents).toBe(700);
		expect(lines.some((l) => l.subcategory === "Lifestyle - Misc")).toBe(false);
	});

	it("refuses a used category, the card payment category, unknown names and unknown types", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(spend("Groceries"));
		await expect(ledger.categories.setCategoryType("Food", "income")).rejects.toThrow(/still use this category/);
		await expect(ledger.categories.setCategoryType("Transfers", "expense")).rejects.toThrow(/Credit card payment/);
		await expect(ledger.categories.setCategoryType("Nope", "expense")).rejects.toThrow(/No category/);
		await expect(ledger.categories.setCategoryType("Lifestyle", "bogus" as never)).rejects.toThrow(/not a category type/);
		expect(typeOf(ledger, "Food")).toBe("expense");
	});
});
