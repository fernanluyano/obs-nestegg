import { removeBudgetLines } from "../notes/budgetNote";
import type { LedgerStore } from "./LedgerStore";

// Subcategories that left the category list take their plan lines with them, in every month.
// The caller reloads the store once its own change is done.
export async function dropBudgetLines(store: LedgerStore, subcategories: string[]): Promise<void> {
	for (const record of store.snapshot.budgets) {
		if (!record.lines.some((l) => subcategories.includes(l.subcategory))) continue;
		await store.port.modify(record.path, (content) => removeBudgetLines(content, subcategories));
	}
}
