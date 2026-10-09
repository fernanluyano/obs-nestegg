import { isYearMonth } from "../domain/dates";
import { paymentSubcategories, seedBudgetLines } from "../domain/budget";
import { buildBudgetNote, setPlanned } from "../notes/budgetNote";
import { budgetPath } from "../notes/paths";
import { findBudget, previousBudget } from "../snapshot/budgetQueries";
import { LedgerError } from "./errors";
import type { LedgerStore } from "./LedgerStore";

export class BudgetService {
	constructor(private store: LedgerStore) {}

	// Creates the month's budget from the previous month's plan, or from zeros when there is none.
	// A month that already has a budget is left alone.
	async create(month: string): Promise<void> {
		if (!isYearMonth(month)) throw new LedgerError(`"${month}" is not a month`);
		const { snapshot, port } = this.store;
		if (findBudget(snapshot, month)) return;

		const categories = snapshot.categories.map((c) => c.category);
		const linked = paymentSubcategories(snapshot.accounts.map((a) => a.account));
		const lines = seedBudgetLines(categories, previousBudget(snapshot, month)?.lines ?? [], linked);
		await port.create(budgetPath(month), buildBudgetNote(month, lines));
		await this.store.reload();
	}

	async setPlanned(month: string, subcategory: string, plannedCents: number): Promise<void> {
		const record = findBudget(this.store.snapshot, month);
		if (!record) throw new LedgerError(`There is no budget for ${month}`);
		const type = this.store.index.typeOf(subcategory);
		if (!type) throw new LedgerError(`No subcategory named "${subcategory}"`);
		const linked = paymentSubcategories(this.store.snapshot.accounts.map((a) => a.account));
		if (type === "transfer") throw new LedgerError("A transfer is not budgeted");
		if (type === "debt" && !linked.has(subcategory)) throw new LedgerError("A debt payment is only budgeted once a loan's payment category is set to it");

		await this.store.port.modify(record.path, (content) => setPlanned(content, subcategory, plannedCents));
		await this.store.reload();
	}
}
