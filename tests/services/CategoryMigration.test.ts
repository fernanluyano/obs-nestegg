import { describe, expect, it } from "vitest";
import { budgetPath, categoryPath, monthPath } from "../../notes/paths";
import { validateSnapshot } from "../../validation/validate";
import { loadedLedger } from "../helpers/ledgerFixture";

const spend = (subcategory: string, amountCents = -100, date = "2026-10-03") =>
	({ account: "Cash Main", date, merchant: "", subcategory, amountCents, note: "", tags: [], fromTo: "" });
const subcategoriesOf = (ledger: Awaited<ReturnType<typeof loadedLedger>>["ledger"], category: string) =>
	ledger.snapshot.categories.find((c) => c.category.name === category)?.category.subcategories.map((s) => s.name);
const used = (ledger: Awaited<ReturnType<typeof loadedLedger>>["ledger"]) =>
	ledger.snapshot.months.flatMap((m) => m.transactions.map((t) => t.subcategory));

describe("removeSubcategory with a migration target", () => {
	it("points every transaction, in every month and account, at the target and then deletes it", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(spend("Restaurants", -2000));
		await ledger.transactions.add(spend("Restaurants", -500, "2026-09-12"));
		await ledger.transactions.add({ ...spend("Restaurants", -700), account: "Savings" });
		await ledger.transactions.add(spend("Groceries", -300));

		await ledger.categories.removeSubcategory("Restaurants", "Groceries");

		expect(subcategoriesOf(ledger, "Food")).not.toContain("Restaurants");
		expect(used(ledger).sort()).toEqual(["Groceries", "Groceries", "Groceries", "Groceries"]);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("keeps amounts, month totals and balances as they were", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(spend("Restaurants", -2000));
		const before = ledger.snapshot.accounts.map((a) => a.account.balanceCents);
		await ledger.categories.removeSubcategory("Restaurants", "Food - Misc");
		expect(ledger.snapshot.months[0]).toMatchObject({ stored: { expenseCents: 2000 }, transactions: [{ amountCents: -2000 }] });
		expect(ledger.snapshot.accounts.map((a) => a.account.balanceCents)).toEqual(before);
	});

	it("folds its planned amounts into the target in every month", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(spend("Restaurants"));
		for (const month of ["2026-09", "2026-10"]) {
			await ledger.budgets.create(month);
			await ledger.budgets.setPlanned(month, "Restaurants", 8000);
			await ledger.budgets.setPlanned(month, "Groceries", 40000);
		}
		await ledger.categories.removeSubcategory("Restaurants", "Groceries");
		for (const b of ledger.snapshot.budgets) {
			expect(b.lines.find((l) => l.subcategory === "Groceries")!.plannedCents).toBe(48000);
			expect(b.lines.some((l) => l.subcategory === "Restaurants")).toBe(false);
		}
	});

	it("ignores the target when nothing uses the subcategory", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.categories.removeSubcategory("Restaurants", "Not even real");
		expect(subcategoriesOf(ledger, "Food")).not.toContain("Restaurants");
		expect(vault.files.has(monthPath("Cash Main", "2026-10"))).toBe(false);
	});

	it("refuses without a target, and with a target that cannot take the rows", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(spend("Restaurants"));
		await expect(ledger.categories.removeSubcategory("Restaurants")).rejects.toThrow(/still use this subcategory/);
		await expect(ledger.categories.removeSubcategory("Restaurants", "Salary")).rejects.toThrow(/cannot take over/);
		await expect(ledger.categories.removeSubcategory("Restaurants", "Restaurants")).rejects.toThrow(/cannot take over/);
		expect(subcategoriesOf(ledger, "Food")).toContain("Restaurants");
		expect(used(ledger)).toEqual(["Restaurants"]);
	});

	it("moves nothing if the staged data would not validate", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.transactions.add(spend("Restaurants"));
		await ledger.budgets.create("2026-10");
		const before = vault.files.get(budgetPath("2026-10"));
		vault.files.set(budgetPath("2026-10"), before!.replace("| 0 |", "| lots |"));
		await ledger.reload();
		await expect(ledger.categories.removeSubcategory("Restaurants", "Groceries")).rejects.toThrow(/unreadable rows/);
		expect(used(ledger)).toEqual(["Restaurants"]);
	});
});

describe("adding a category that shares a name with an existing subcategory", () => {
	it("creates the category and lets subcategories be added to it", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.categories.createCategory("Utilities", "expense");
		await ledger.categories.addSubcategory("Utilities", "ElectricityP1", "expense");
		expect(vault.exists(categoryPath("Utilities"))).toBe(true);
		expect(subcategoriesOf(ledger, "Utilities")).toEqual(["ElectricityP1", "Utilities - Misc"]);
	});
});

describe("moving into something added moments ago", () => {
	it("accepts a subcategory that was just added as the target", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(spend("Restaurants"));
		await ledger.categories.addSubcategory("Food", "Coffee", "expense");
		await ledger.categories.removeSubcategory("Restaurants", "Coffee");
		expect(used(ledger)).toEqual(["Coffee"]);
	});

	it("accepts the Misc subcategory of a category that was just created", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(spend("Restaurants"));
		await ledger.categories.createCategory("Pets", "expense");
		await ledger.categories.removeSubcategory("Restaurants", "Pets - Misc");
		expect(used(ledger)).toEqual(["Pets - Misc"]);
	});
});

describe("a category holding several types", () => {
	it("only offers a target of the transactions' own type, in any category", async () => {
		const { ledger } = await loadedLedger();
		await ledger.categories.addSubcategory("Food", "Meal refund", "income");
		await ledger.transactions.add(spend("Meal refund", 900));
		await expect(ledger.categories.removeSubcategory("Meal refund", "Groceries")).rejects.toThrow(/cannot take over/);
		await ledger.categories.removeSubcategory("Meal refund", "Salary");
		expect(used(ledger)).toEqual(["Salary"]);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("refuses to remove a category whose used subcategories have different types", async () => {
		const { ledger } = await loadedLedger();
		await ledger.categories.addSubcategory("Food", "Meal refund", "income");
		await ledger.transactions.add(spend("Groceries"));
		await ledger.transactions.add(spend("Meal refund", 900));
		await expect(ledger.categories.removeCategory("Food", "Rent")).rejects.toThrow(/one at a time/);
		expect(used(ledger).sort()).toEqual(["Groceries", "Meal refund"]);
	});
});

describe("removeCategory with a migration target", () => {
	it("moves the transactions of all its subcategories, then removes the note", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.transactions.add(spend("Groceries"));
		await ledger.transactions.add(spend("Restaurants"));
		await ledger.transactions.add(spend("Rent"));

		await ledger.categories.removeCategory("Food", "Rent");

		expect(vault.exists(categoryPath("Food"))).toBe(false);
		expect(used(ledger)).toEqual(["Rent", "Rent", "Rent"]);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("will not move a category's transactions into the category itself", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(spend("Groceries"));
		await expect(ledger.categories.removeCategory("Food")).rejects.toThrow(/still use this category/);
		await expect(ledger.categories.removeCategory("Food", "Restaurants")).rejects.toThrow(/cannot take over/);
		expect(used(ledger)).toEqual(["Groceries"]);
	});

	it("moves an income category's transactions to another income subcategory", async () => {
		const { ledger } = await loadedLedger();
		await ledger.categories.createCategory("Side gigs", "income");
		await ledger.categories.addSubcategory("Side gigs", "Tutoring", "income");
		await ledger.transactions.add(spend("Tutoring", 5000));
		await ledger.categories.removeCategory("Side gigs", "Salary");
		expect(used(ledger)).toEqual(["Salary"]);
		expect(ledger.snapshot.months[0].stored).toMatchObject({ incomeCents: 5000, expenseCents: 0 });
	});
});
