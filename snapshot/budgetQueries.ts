import { buildBudgetSheet, type BudgetSheet } from "../domain/budget";
import { categoryIndexOf, type BudgetRecord, type Snapshot } from "./snapshot";
import { monthEntries } from "./queries";

export function findBudget(snapshot: Snapshot, month: string): BudgetRecord | undefined {
	return snapshot.budgets.find((b) => b.month === month);
}

// The latest budget strictly before `month`, which a new month copies its plan from.
export function previousBudget(snapshot: Snapshot, month: string): BudgetRecord | undefined {
	return snapshot.budgets
		.filter((b) => b.month < month)
		.reduce<BudgetRecord | undefined>((latest, b) => (latest && latest.month > b.month ? latest : b), undefined);
}

export function budgetSheetOf(snapshot: Snapshot, month: string): BudgetSheet {
	const lines = findBudget(snapshot, month)?.lines ?? [];
	const accounts = snapshot.accounts.map((a) => a.account);
	return buildBudgetSheet(snapshot.categories.map((c) => c.category), lines, monthEntries(snapshot, month), categoryIndexOf(snapshot), accounts);
}
