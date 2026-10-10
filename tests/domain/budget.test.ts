import { describe, expect, it } from "vitest";
import { actualsBySubcategory, budgetProgress, buildBudgetSheet, categoryTotals, parsePlanned, paymentSubcategories, sectionsByCategory, seedBudgetLines } from "../../domain/budget";
import { buildCategoryIndex } from "../../domain/categories";
import { defaultCategories } from "../../domain/defaults";
import type { LedgerEntry } from "../../domain/types";
import { account, category, index, tx } from "../helpers/fixtures";

const categories = defaultCategories();
const withPayment = categories.map((c) => (c.name === "Transfers" ? { ...c, subcategories: [...c.subcategories, { name: "Mortgage payment", type: "debt" as const }] } : c));
const transferIndex = buildCategoryIndex(withPayment);
const debts = [
	account({ name: "Mortgage", accountType: "loan", loanKind: "mortgage", paymentSubcategory: "Mortgage payment" }),
	account({ name: "Cash Main" }),
];
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

	it("ignores unknown subcategories", () => {
		expect(actualsBySubcategory([entry({ subcategory: "Nope" })], index).size).toBe(0);
	});

	it("counts a debt payment once, as the money that left the cash account", () => {
		const out = entry({ subcategory: "Mortgage payment", amountCents: -50000, fromTo: "Mortgage" });
		const in_ = entry({ account: "Mortgage", subcategory: "Mortgage payment", amountCents: 50000, fromTo: "Cash Main" });
		const totals = actualsBySubcategory([out, in_], transferIndex, new Set(["Mortgage"]));
		expect(totals.get("Mortgage payment")).toBe(50000);
	});

	it("never counts rows on debt accounts, even when their sign is negative", () => {
		const onLoan = entry({ account: "Mortgage", subcategory: "Mortgage payment", amountCents: -50000 });
		expect(actualsBySubcategory([onLoan], transferIndex, new Set(["Mortgage"])).size).toBe(0);
	});

	it("does not count plain transfers, cash to cash or to a card", () => {
		const out = entry({ subcategory: "Account transfer", amountCents: -2500, fromTo: "Savings" });
		const card = entry({ subcategory: "Credit card payment", amountCents: -4000, fromTo: "Card" });
		expect(actualsBySubcategory([out, card], transferIndex).size).toBe(0);
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

	it("splits income from expense sections and leaves unlinked transfers out", () => {
		expect(sheet.income.map((s) => s.category)).toEqual(["Income"]);
		expect(sheet.expense.map((s) => s.category)).toContain("Food");
		expect(sheet.payments).toEqual([]);
		expect([...sheet.income, ...sheet.expense].some((s) => s.category === "Transfers")).toBe(false);
	});

	it("counts spending on lines with no plan as unbudgeted, inside the total, with refunds netted and income left out", () => {
		const cats = [category("Home", "expense", ["Rent", "Vet", ["Salary", "income"]])];
		const result = buildBudgetSheet(
			cats,
			[{ subcategory: "Rent", plannedCents: 100000 }],
			[
				entry({ subcategory: "Rent", amountCents: -90000 }),
				entry({ subcategory: "Vet", amountCents: -50000 }),
				entry({ subcategory: "Vet", amountCents: 20000 }),
				entry({ subcategory: "Salary", amountCents: 300000 }),
			],
			buildCategoryIndex(cats),
		);
		expect(result.summary).toMatchObject({
			expensePlannedCents: 100000,
			expenseActualCents: 120000,
			unbudgetedCents: 30000,
			surplusCents: 180000,
		});
	});

	it("splits a category that holds several types into one section per type", () => {
		const mixed = [category("Home", "expense", ["Rent", ["Rental income", "income"]])];
		const mixedIndex = buildCategoryIndex(mixed);
		const split = buildBudgetSheet(
			mixed,
			[{ subcategory: "Rent", plannedCents: 100000 }, { subcategory: "Rental income", plannedCents: 120000 }],
			[entry({ subcategory: "Rent", amountCents: -90000 }), entry({ subcategory: "Rental income", amountCents: 120000 })],
			mixedIndex,
		);
		expect(split.expense.map((s) => [s.category, s.rows.map((r) => r.subcategory)])).toEqual([["Home", ["Rent"]]]);
		expect(split.income.map((s) => [s.category, s.rows.map((r) => r.subcategory)])).toEqual([["Home", ["Rental income"]]]);
		expect(split.summary).toMatchObject({ expensePlannedCents: 100000, expenseActualCents: 90000, incomePlannedCents: 120000, incomeActualCents: 120000 });
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
			unbudgetedCents: 0,
			surplusCents: 203000,
		});
	});

	it("is all zeros with no lines and no entries", () => {
		expect(buildBudgetSheet(categories, [], [], index).summary).toEqual({
			incomePlannedCents: 0, incomeActualCents: 0, expensePlannedCents: 0, expenseActualCents: 0, expenseLeftCents: 0, unbudgetedCents: 0, surplusCents: 0,
		});
	});
});

describe("linked debt payment lines", () => {
	const lines = [{ subcategory: "Mortgage payment", plannedCents: 150000 }, { subcategory: "Account transfer", plannedCents: 777 }];
	const payment = (account_: string, amountCents: number) =>
		entry({ account: account_, subcategory: "Mortgage payment", amountCents, fromTo: account_ === "Mortgage" ? "Cash Main" : "Mortgage" });
	const sheetOf = (entries: LedgerEntry[]) => buildBudgetSheet(withPayment, lines, entries, transferIndex, debts);

	it("budgets only the subcategory a debt account names", () => {
		const sheet = sheetOf([]);
		expect(sheet.payments.map((s) => s.category)).toEqual(["Transfers"]);
		expect(sheet.payments[0].rows.map((r) => r.subcategory)).toEqual(["Mortgage payment"]);
		expect(sheet.payments[0].rows[0].plannedCents).toBe(150000);
	});

	it("shows planned against paid, counting the payment once", () => {
		const sheet = sheetOf([payment("Cash Main", -50000), payment("Mortgage", 50000)]);
		expect(sheet.payments[0].rows[0]).toMatchObject({ plannedCents: 150000, actualCents: 50000 });
		expect(sheet.payments[0].rows[0].progress).toEqual({ pct: 33.33333333333333, state: "under", leftCents: 100000 });
	});

	it("counts payments in the expense totals, once", () => {
		const withPay = sheetOf([payment("Cash Main", -50000), payment("Mortgage", 50000)]);
		expect(withPay.summary).toMatchObject({
			expensePlannedCents: 150000,
			expenseActualCents: 50000,
			expenseLeftCents: 100000,
			surplusCents: -50000,
			incomeActualCents: 0,
		});
		expect(sheetOf([]).summary.expensePlannedCents).toBe(150000);
	});

	it("adds payments to the plain expenses already in the totals", () => {
		const both = sheetOf([entry({ amountCents: -2500 }), payment("Cash Main", -50000), payment("Mortgage", 50000)]);
		expect(both.summary.expenseActualCents).toBe(52500);
	});

	it("ignores an archived debt account's link", () => {
		const archived = [account({ name: "Mortgage", accountType: "loan", loanKind: "mortgage", paymentSubcategory: "Mortgage payment", active: false })];
		expect(buildBudgetSheet(withPayment, lines, [], transferIndex, archived).payments).toEqual([]);
	});
});

describe("sectionsByCategory", () => {
	const housing = [
		category("Housing", "expense", ["Rent", ["Mortgage", "debt"], ["Rental income", "income"]]),
		category("Food", "expense", ["Groceries"]),
	];
	const linked = [account({ name: "House", accountType: "loan", loanKind: "mortgage", paymentSubcategory: "Mortgage" })];
	const sheet = buildBudgetSheet(housing, [], [], buildCategoryIndex(housing), linked);

	it("shows a category that holds several types once", () => {
		const groups = sectionsByCategory([...sheet.income, ...sheet.expense, ...sheet.payments]);
		expect(groups.map((g) => g[0].category).sort()).toEqual(["Food", "Housing"]);
		expect(groups.find((g) => g[0].category === "Housing")!.map((s) => s.type)).toEqual(["expense", "income", "debt"]);
	});

	it("puts the expense rows first so its totals stand for the category, and never merges rows", () => {
		const group = sectionsByCategory([...sheet.payments, ...sheet.income, ...sheet.expense]).find((g) => g[0].category === "Housing")!;
		expect(group[0].type).toBe("expense");
		expect(group.flatMap((s) => s.rows.map((r) => r.subcategory))).toEqual(["Rent", "Rental income", "Mortgage"]);
	});

	it("keeps a single-type category as a group of one", () => {
		expect(sectionsByCategory(sheet.expense.filter((s) => s.category === "Food"))).toHaveLength(1);
		expect(sectionsByCategory([])).toEqual([]);
	});
});

describe("categoryTotals", () => {
	const mixed = [category("Home", "expense", ["Rent", ["Mortgage", "debt"], ["Rental income", "income"]])];
	const loan = [account({ name: "House", accountType: "loan", loanKind: "mortgage", paymentSubcategory: "Mortgage" })];
	const sheet = buildBudgetSheet(
		mixed,
		[
			{ subcategory: "Rent", plannedCents: 100000 },
			{ subcategory: "Mortgage", plannedCents: 185453 },
			{ subcategory: "Rental income", plannedCents: 120000 },
		],
		[
			entry({ subcategory: "Rent", amountCents: -90000 }),
			entry({ subcategory: "Mortgage", amountCents: -185453, fromTo: "House" }),
			entry({ subcategory: "Rental income", amountCents: 120000 }),
		],
		buildCategoryIndex(mixed),
		loan,
	);
	const group = sectionsByCategory([...sheet.income, ...sheet.expense, ...sheet.payments])[0];

	it("adds the debt payment rows to the expense rows and leaves income out", () => {
		const totals = categoryTotals(group);
		expect(totals.plannedCents).toBe(100000 + 185453);
		expect(totals.actualCents).toBe(90000 + 185453);
		expect(totals.progress).toEqual(budgetProgress(285453, 275453));
	});

	it("totals only the debt payments when that is all a category has", () => {
		const onlyDebt = group.filter((s) => s.type === "debt");
		expect(categoryTotals(onlyDebt)).toMatchObject({ plannedCents: 185453, actualCents: 185453 });
	});

	it("shows the income of a category that has nothing else", () => {
		const onlyIncome = group.filter((s) => s.type === "income");
		expect(categoryTotals(onlyIncome)).toMatchObject({ plannedCents: 120000, actualCents: 120000 });
	});
});

describe("paymentSubcategories", () => {
	it("collects the payment subcategories of active loans only", () => {
		const accounts = [
			account({ name: "Card", accountType: "creditCard", paymentSubcategory: "Credit card payment" }),
			account({ name: "Old", accountType: "loan", loanKind: "car", paymentSubcategory: "Car payment", active: false }),
			account({ name: "House", accountType: "loan", loanKind: "mortgage", paymentSubcategory: "Mortgage payment" }),
			account({ name: "Plain", accountType: "loan", loanKind: "other" }),
			account({ name: "Cash Main" }),
		];
		expect([...paymentSubcategories(accounts)]).toEqual(["Mortgage payment"]);
	});
});

describe("seedBudgetLines", () => {
	it("includes the linked debt payment subcategories and no other", () => {
		const seeded = seedBudgetLines(withPayment, [{ subcategory: "Mortgage payment", plannedCents: 150000 }], new Set(["Mortgage payment"]));
		expect(seeded.find((l) => l.subcategory === "Mortgage payment")!.plannedCents).toBe(150000);
		expect(seeded.some((l) => l.subcategory === "Loan payment")).toBe(false);
		expect(seeded.some((l) => l.subcategory === "Account transfer")).toBe(false);
		expect(seeded.some((l) => l.subcategory === "Credit card payment")).toBe(false);
	});

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
