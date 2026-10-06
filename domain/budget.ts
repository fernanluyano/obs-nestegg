import { parseCents } from "./money";
import type { CategoryIndex } from "./categories";
import type { BudgetLine, Category, LedgerEntry } from "./types";

export type BudgetState = "under" | "at" | "over";

export interface BudgetProgress {
	pct: number; // 0-100, how much of the plan is used; the bar never grows past full
	state: BudgetState;
	leftCents: number; // planned minus actual: negative when over
}

type BudgetType = "expense" | "income";

export interface BudgetRow {
	subcategory: string;
	plannedCents: number;
	actualCents: number;
	progress: BudgetProgress;
}

export interface BudgetSection {
	category: string;
	type: BudgetType;
	rows: BudgetRow[];
	plannedCents: number;
	actualCents: number;
	progress: BudgetProgress;
}

export interface BudgetSummary {
	incomePlannedCents: number;
	incomeActualCents: number;
	expensePlannedCents: number;
	expenseActualCents: number;
	expenseLeftCents: number;
	surplusCents: number; // income received minus money spent
}

export interface BudgetSheet {
	income: BudgetSection[];
	expense: BudgetSection[];
	summary: BudgetSummary;
}

const isBudgeted = (c: Category): c is Category & { categoryType: BudgetType } => c.categoryType !== "transfer";

// What the planned-amount field accepts: dollars typed with up to two decimals, never negative.
// A blank field means no plan, which is zero.
export function parsePlanned(text: string): number | null {
	const cleaned = text.replace(/[$,\s]/g, "");
	if (cleaned === "") return 0;
	const cents = parseCents(cleaned);
	return cents === null || cents < 0 ? null : cents;
}

export function budgetProgress(plannedCents: number, actualCents: number): BudgetProgress {
	const leftCents = plannedCents - actualCents;
	const used = plannedCents > 0 ? (actualCents / plannedCents) * 100 : actualCents > 0 ? 100 : 0;
	return {
		pct: Math.min(100, Math.max(0, used)),
		state: leftCents === 0 ? "at" : leftCents > 0 ? "under" : "over",
		leftCents,
	};
}

// Money that moved under each subcategory, counted in the direction of its category: spending is
// positive under an expense (a refund nets it down) and received money is positive under an
// income. Transfers and unknown subcategories count nowhere.
export function actualsBySubcategory(entries: LedgerEntry[], index: CategoryIndex): Map<string, number> {
	const totals = new Map<string, number>();
	for (const entry of entries) {
		const type = index.typeOf(entry.subcategory);
		if (type !== "expense" && type !== "income") continue;
		const signed = type === "expense" ? -entry.amountCents : entry.amountCents;
		totals.set(entry.subcategory, (totals.get(entry.subcategory) ?? 0) + signed);
	}
	return totals;
}

function buildSection(category: Category & { categoryType: BudgetType }, planned: Map<string, number>, actuals: Map<string, number>): BudgetSection {
	const rows = category.subcategories.map((subcategory): BudgetRow => {
		const plannedCents = planned.get(subcategory) ?? 0;
		const actualCents = actuals.get(subcategory) ?? 0;
		return { subcategory, plannedCents, actualCents, progress: budgetProgress(plannedCents, actualCents) };
	});
	const plannedCents = rows.reduce((sum, r) => sum + r.plannedCents, 0);
	const actualCents = rows.reduce((sum, r) => sum + r.actualCents, 0);
	return { category: category.name, type: category.categoryType, rows, plannedCents, actualCents, progress: budgetProgress(plannedCents, actualCents) };
}

const sumOf = (sections: BudgetSection[], key: "plannedCents" | "actualCents") => sections.reduce((sum, s) => sum + s[key], 0);

// Every expense and income subcategory gets a row, planned at zero when the budget has no line
// for it. Lines for subcategories that no longer exist are ignored.
export function buildBudgetSheet(categories: Category[], lines: BudgetLine[], entries: LedgerEntry[], index: CategoryIndex): BudgetSheet {
	const planned = new Map(lines.map((l) => [l.subcategory, l.plannedCents]));
	const actuals = actualsBySubcategory(entries, index);
	const sections = categories.filter(isBudgeted).map((c) => buildSection(c, planned, actuals));
	const income = sections.filter((s) => s.type === "income");
	const expense = sections.filter((s) => s.type === "expense");

	const expensePlannedCents = sumOf(expense, "plannedCents");
	const expenseActualCents = sumOf(expense, "actualCents");
	const incomeActualCents = sumOf(income, "actualCents");
	return {
		income,
		expense,
		summary: {
			incomePlannedCents: sumOf(income, "plannedCents"),
			incomeActualCents,
			expensePlannedCents,
			expenseActualCents,
			expenseLeftCents: expensePlannedCents - expenseActualCents,
			surplusCents: incomeActualCents - expenseActualCents,
		},
	};
}

// A new month starts from the plan of the one before it, and only the plan: what was left over or
// overspent does not carry. Subcategories added since get a zero line.
export function seedBudgetLines(categories: Category[], previous: BudgetLine[]): BudgetLine[] {
	const planned = new Map(previous.map((l) => [l.subcategory, l.plannedCents]));
	return categories
		.filter(isBudgeted)
		.flatMap((c) => c.subcategories)
		.map((subcategory) => ({ subcategory, plannedCents: planned.get(subcategory) ?? 0 }));
}
