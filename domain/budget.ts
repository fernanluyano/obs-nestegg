import { parseCents } from "./money";
import type { CategoryIndex } from "./categories";
import { isLiability, type Account, type BudgetLine, type Category, type LedgerEntry, type Subcategory } from "./types";

export type BudgetState = "under" | "at" | "over";

export interface BudgetProgress {
	pct: number; // 0-100, how much of the plan is used; the bar never grows past full
	state: BudgetState;
	leftCents: number; // planned minus actual: negative when over
}

// A debt payment subcategory is budgeted only as the payment category of a loan. Transfers never are.
type BudgetType = "expense" | "income" | "debt";

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
	payments: BudgetSection[]; // planned vs paid on loans; counted in the expense totals like any spending
	summary: BudgetSummary;
}

// The debt payment subcategories that can be planned: the ones an active loan names for its payments.
export function paymentSubcategories(accounts: Account[]): Set<string> {
	const linked = accounts.filter((a) => a.active && a.accountType === "loan" && a.paymentSubcategory);
	return new Set(linked.map((a) => a.paymentSubcategory!));
}

// Whether a subcategory gets a budget row: every expense and income one, only the linked debt payments.
const isBudgeted = (sub: Subcategory, linked: ReadonlySet<string>): boolean =>
	sub.type === "expense" || sub.type === "income" || (sub.type === "debt" && linked.has(sub.name));

const BUDGET_TYPES: readonly BudgetType[] = ["income", "expense", "debt"];

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
// income. A debt payment counts once, as the money that left a cash account, so a payment shows its
// amount and not double; rows on debt accounts never count. Transfers and unknown subcategories count nowhere.
export function actualsBySubcategory(entries: LedgerEntry[], index: CategoryIndex, debtAccounts: ReadonlySet<string> = new Set()): Map<string, number> {
	const totals = new Map<string, number>();
	const add = (subcategory: string, cents: number) => totals.set(subcategory, (totals.get(subcategory) ?? 0) + cents);
	for (const entry of entries) {
		const type = index.typeOf(entry.subcategory);
		if (type === "expense") add(entry.subcategory, -entry.amountCents);
		else if (type === "income") add(entry.subcategory, entry.amountCents);
		else if (type === "debt" && entry.amountCents < 0 && !debtAccounts.has(entry.account)) add(entry.subcategory, -entry.amountCents);
	}
	return totals;
}

function buildSection(category: string, type: BudgetType, subcategories: string[], planned: Map<string, number>, actuals: Map<string, number>): BudgetSection {
	const rows = subcategories.map((subcategory): BudgetRow => {
		const plannedCents = planned.get(subcategory) ?? 0;
		const actualCents = actuals.get(subcategory) ?? 0;
		return { subcategory, plannedCents, actualCents, progress: budgetProgress(plannedCents, actualCents) };
	});
	const plannedCents = rows.reduce((sum, r) => sum + r.plannedCents, 0);
	const actualCents = rows.reduce((sum, r) => sum + r.actualCents, 0);
	return { category, type, rows, plannedCents, actualCents, progress: budgetProgress(plannedCents, actualCents) };
}

const sumOf = (sections: BudgetSection[], key: "plannedCents" | "actualCents") => sections.reduce((sum, s) => sum + s[key], 0);

// Every expense and income subcategory gets a row, and so does each linked debt payment subcategory,
// planned at zero when the budget has no line for it. Lines for subcategories that no longer
// exist, or that are no longer budgeted, are ignored.
export function buildBudgetSheet(categories: Category[], lines: BudgetLine[], entries: LedgerEntry[], index: CategoryIndex, accounts: Account[] = []): BudgetSheet {
	const planned = new Map(lines.map((l) => [l.subcategory, l.plannedCents]));
	const debts = new Set(accounts.filter((a) => isLiability(a.accountType)).map((a) => a.name));
	const actuals = actualsBySubcategory(entries, index, debts);
	const linked = paymentSubcategories(accounts);
	// A category holding several types gets one section per type, so each total keeps its meaning.
	const sections = categories.flatMap((c) =>
		BUDGET_TYPES.map((type) => ({ category: c.name, type, names: c.subcategories.filter((s) => s.type === type && isBudgeted(s, linked)).map((s) => s.name) }))
			.filter((s) => s.names.length > 0)
			.map((s) => buildSection(s.category, s.type, s.names, planned, actuals)),
	);
	const income = sections.filter((s) => s.type === "income");
	const expense = sections.filter((s) => s.type === "expense");
	const payments = sections.filter((s) => s.type === "debt");

	// Debt payments are spending like any other, so they count in the expense totals.
	const spending = [...expense, ...payments];
	const expensePlannedCents = sumOf(spending, "plannedCents");
	const expenseActualCents = sumOf(spending, "actualCents");
	const incomeActualCents = sumOf(income, "actualCents");
	return {
		income,
		expense,
		payments,
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

const GROUP_ORDER: readonly BudgetType[] = ["expense", "income", "debt"];

// One group per category, in the order categories first appear, so a category that holds several
// types is shown once. Within a group the expense rows come first and the first section is the one
// whose totals stand for the category.
export function sectionsByCategory(sections: BudgetSection[]): BudgetSection[][] {
	const groups = new Map<string, BudgetSection[]>();
	for (const section of sections) groups.set(section.category, [...(groups.get(section.category) ?? []), section]);
	return [...groups.values()].map((group) => [...group].sort((a, b) => GROUP_ORDER.indexOf(a.type) - GROUP_ORDER.indexOf(b.type)));
}

export interface CategoryTotals {
	plannedCents: number;
	actualCents: number;
	progress: BudgetProgress;
}

// The total a category card shows: what is planned and spent on it, debt payments included, since
// they are money out of the same budget. Income rows in the same category are left out so a
// received amount never offsets a spent one. A category with only income shows its income.
export function categoryTotals(group: BudgetSection[]): CategoryTotals {
	const spending = group.filter((s) => s.type !== "income");
	const counted = spending.length > 0 ? spending : group;
	const plannedCents = counted.reduce((sum, s) => sum + s.plannedCents, 0);
	const actualCents = counted.reduce((sum, s) => sum + s.actualCents, 0);
	return { plannedCents, actualCents, progress: budgetProgress(plannedCents, actualCents) };
}

// A new month starts from the plan of the one before it, and only the plan: what was left over or
// overspent does not carry. Subcategories added since get a zero line.
export function seedBudgetLines(categories: Category[], previous: BudgetLine[], linked: ReadonlySet<string> = new Set()): BudgetLine[] {
	const planned = new Map(previous.map((l) => [l.subcategory, l.plannedCents]));
	return categories
		.flatMap((c) => c.subcategories.filter((s) => isBudgeted(s, linked)).map((s) => s.name))
		.map((subcategory) => ({ subcategory, plannedCents: planned.get(subcategory) ?? 0 }));
}
