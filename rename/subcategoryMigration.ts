import { migrationTargets } from "../domain/categories";
import { moveBudgetLine } from "../notes/budgetNote";
import { MONTH_COLUMNS } from "../notes/monthNote";
import { mapColumn } from "../notes/tableColumns";
import { RenameError, type FileChange, type PlanContext, type RenamePlan } from "./types";

const [DATE_COLUMN, , SUBCATEGORY_COLUMN] = MONTH_COLUMNS;

// Points every transaction of the removed subcategories at `target` and folds their budget lines
// into the target's. The caller removes the then-unused subcategories afterwards. Only the
// Subcategory cells change, so amounts, totals and balances are untouched.
export async function planSubcategoryMigration(ctx: PlanContext, removed: string[], target: string): Promise<RenamePlan> {
	const owner = ctx.snapshot.categories.find((c) => c.category.subcategories.includes(removed[0]));
	if (!owner) throw new RenameError(`No subcategory named "${removed[0]}"`);

	const categories = ctx.snapshot.categories.map((c) => c.category);
	if (!migrationTargets(categories, owner.category.categoryType, removed).some((o) => o.subcategory === target)) {
		throw new RenameError(`"${target}" cannot take over these transactions`);
	}

	const changes: FileChange[] = [];
	for (const month of ctx.snapshot.months) {
		if (!month.transactions.some((tx) => removed.includes(tx.subcategory))) continue;
		const content = mapColumn(await ctx.read(month.path), DATE_COLUMN, SUBCATEGORY_COLUMN, (v) => (removed.includes(v) ? target : v));
		changes.push({ fromPath: month.path, toPath: month.path, content });
	}
	for (const budget of ctx.snapshot.budgets) {
		if (!budget.lines.some((l) => removed.includes(l.subcategory))) continue;
		const content = removed.reduce((text, from) => moveBudgetLine(text, from, target), await ctx.read(budget.path));
		changes.push({ fromPath: budget.path, toPath: budget.path, content });
	}
	return { changes };
}
