import { describe, expect, it } from "vitest";
import { actualsBySubcategory, budgetProgress, buildBudgetSheet, parsePlanned, seedBudgetLines } from "../../domain/budget";
import { defaultCategories } from "../../domain/defaults";
import type { LedgerEntry } from "../../domain/types";
import { index, tx } from "../helpers/fixtures";

const categories = defaultCategories();
const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({ ...tx(), account: "Cash Main", ...over });

describe("parsePlanned", () => {
	it("reads typed dollars as cents from the digits", () => {
		expect(parsePlanned("450")).toBe(45000);
		expect(parsePlanned("1.15")).toBe(115);
		expect(parsePlanned("$1,250.5")).toBe(125050);
		expect(parsePlanned(" 12 ")).toBe(1200);
	});

	it("reads a blank field as no plan", () => {
		expect(parsePlanned("")).toBe(0);
		expect(parsePlanned(" $ ")).toBe(0);
	});

	it("rejects negatives and text", () => {
		expect(parsePlanned("-5")).toBeNull();
		expect(parsePlanned("abc")).toBeNull();
		expect(parsePlanned("1.234")).toBeNull();
	});
});

describe("budgetProgress", () => {
	it("is under budget with the bar partly filled", () => {
		expect(budgetProgress(10000, 2500)).toEqual({ pct: 25, state: "under", leftCents: 7500 });
	});

	it("is exactly at budget when nothing is left", () => {
		expect(budgetProgress(10000, 10000)).toEqual({ pct: 100, state: "at", leftCents: 0 });
		expect(budgetProgress(0, 0)).toEqual({ pct: 0, state: "at", leftCents: 0 });
	});

	it("is over budget with the bar capped at full", () => {
		expect(budgetProgress(10000, 15000)).toEqual({ pct: 100, state: "over", leftCents: -5000 });
	});

	it("fills the bar for spending against a zero plan", () => {
		expect(budgetProgress(0, 500)).toEqual({ pct: 100, state: "over", leftCents: -500 });
	});

	it("keeps the bar empty when refunds outweigh spending", () => {
		expect(budgetProgress(10000, -300)).toEqual({ pct: 0, state: "under", leftCents: 10300 });
	});
});

describe("actualsBySubcategory", () => {
	it("counts spending positive and nets refunds down", () => {
		const totals = actualsBySubcategory([entry({ amountCents: -8450 }), entry({ amountCents: -1550 }), entry({ amountCents: 1000 })], index);
		expect(totals.get("Groceries")).toBe(9000);
	});

	it("counts received money positive under an income", () => {
		const totals = actualsBySubcategory([entry({ subcategory: "Salary", amountCents: 250000 }), entry({ subcategory: "Salary", amountCents: -5000 })], index);
		expect(totals.get("Salary")).toBe(245000);
	});

	it("ignores transfers and unknown subcategories", () => {
		const totals = actualsBySubcategory([entry({ subcategory: "Account transfer", amountCents: -5000, fromTo: "Savings" }), entry({ subcategory: "Nope" })], index);
		expect(totals.size).toBe(0);
	});
});

describe("buildBudgetSheet", () => {
	const lines = [
		{ subcategory: "Groceries", plannedCents: 40000 },
		{ subcategory: "Restaurants", plannedCents: 10000 },
		{ subcategory: "Salary", plannedCents: 300000 },
		{ subcategory: "Gone", plannedCents: 99999 },
	];
	const entries = [
		entry({ amountCents: -45000 }),
		entry({ subcategory: "Restaurants", amountCents: -2000 }),
		entry({ subcategory: "Salary", amountCents: 250000 }),
		entry({ subcategory: "Account transfer", amountCents: -100, fromTo: "Savings" }),
	];
	const sheet = buildBudgetSheet(categories, lines, entries, index);

	it("splits income from expense sections and leaves transfers out", () => {
		expect(sheet.income.map((s) => s.category)).toEqual(["Income"]);
		expect(sheet.expense.map((s) => s.category)).toContain("Food");
		expect([...sheet.income, ...sheet.expense].some((s) => s.category === "Transfers")).toBe(false);
	});

	it("gives every subcategory a row, planned at zero when it has no line", () => {
		const food = sheet.expense.find((s) => s.category === "Food")!;
		expect(food.rows.map((r) => r.subcategory)).toEqual(["Groceries", "Restaurants", "Food - Misc"]);
		expect(food.rows[2]).toMatchObject({ plannedCents: 0, actualCents: 0 });
	});

	it("ignores lines whose subcategory no longer exists", () => {
		const all = [...sheet.income, ...sheet.expense].flatMap((s) => s.rows);
		expect(all.some((r) => r.subcategory === "Gone")).toBe(false);
		expect(sheet.summary.expensePlannedCents).toBe(50000);
	});

	it("totals a section from its rows and gives it its own progress", () => {
		const food = sheet.expense.find((s) => s.category === "Food")!;
		expect(food).toMatchObject({ plannedCents: 50000, actualCents: 47000 });
		expect(food.progress).toEqual({ pct: 94, state: "under", leftCents: 3000 });
		expect(food.rows[0].progress.state).toBe("over");
	});

	it("summarizes income, expenses, what is left and the surplus", () => {
		expect(sheet.summary).toEqual({
			incomePlannedCents: 300000,
			incomeActualCents: 250000,
			expensePlannedCents: 50000,
			expenseActualCents: 47000,
			expenseLeftCents: 3000,
			surplusCents: 203000,
		});
	});

	it("is all zeros with no lines and no entries", () => {
		expect(buildBudgetSheet(categories, [], [], index).summary).toEqual({
			incomePlannedCents: 0, incomeActualCents: 0, expensePlannedCents: 0, expenseActualCents: 0, expenseLeftCents: 0, surplusCents: 0,
		});
	});
});

describe("seedBudgetLines", () => {
	it("copies the previous plan and adds zero lines for the rest", () => {
		const seeded = seedBudgetLines(categories, [{ subcategory: "Groceries", plannedCents: 40000 }, { subcategory: "Gone", plannedCents: 5 }]);
		expect(seeded.find((l) => l.subcategory === "Groceries")!.plannedCents).toBe(40000);
		expect(seeded.find((l) => l.subcategory === "Rent")!.plannedCents).toBe(0);
		expect(seeded.some((l) => l.subcategory === "Gone")).toBe(false);
	});

	it("leaves transfers out", () => {
		expect(seedBudgetLines(categories, []).some((l) => l.subcategory === "Account transfer")).toBe(false);
	});
});
