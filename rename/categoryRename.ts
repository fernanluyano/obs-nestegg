import { hasSubcategory } from "../domain/categories";
import { nameProblem, miscName } from "../domain/names";
import { renameBudgetSubcategory } from "../notes/budgetNote";
import { patchProps } from "../notes/frontmatter";
import { renameSubcategoryRow } from "../notes/categoryNote";
import { categoryPath } from "../notes/paths";
import { mapColumn } from "../notes/tableColumns";
import { RenameError, type FileChange, type PlanContext, type RenamePlan } from "./types";

const SUBCATEGORY = "Subcategory";

async function renameSubcategoryInMonths(ctx: PlanContext, from: string, to: string): Promise<FileChange[]> {
	const changes: FileChange[] = [];
	for (const month of ctx.snapshot.months) {
		if (!month.transactions.some((tx) => tx.subcategory === from)) continue;
		const content = mapColumn(await ctx.read(month.path), "Date", SUBCATEGORY, (v) => (v === from ? to : v));
		changes.push({ fromPath: month.path, toPath: month.path, content });
	}
	return changes;
}

async function renameSubcategoryInBudgets(ctx: PlanContext, from: string, to: string): Promise<FileChange[]> {
	const changes: FileChange[] = [];
	for (const budget of ctx.snapshot.budgets) {
		if (!budget.lines.some((l) => l.subcategory === from)) continue;
		changes.push({ fromPath: budget.path, toPath: budget.path, content: renameBudgetSubcategory(await ctx.read(budget.path), from, to) });
	}
	return changes;
}

async function renameSubcategoryInAccounts(ctx: PlanContext, from: string, to: string): Promise<FileChange[]> {
	const changes: FileChange[] = [];
	for (const record of ctx.snapshot.accounts) {
		if (record.account.paymentSubcategory !== from) continue;
		changes.push({ fromPath: record.path, toPath: record.path, content: patchProps(await ctx.read(record.path), { paymentSubcategory: to }) });
	}
	return changes;
}

function uniqueSubcategory(ctx: PlanContext, name: string): boolean {
	return !ctx.snapshot.categories.some((c) => hasSubcategory(c.category, name));
}

// Renaming a subcategory rewrites its row in the category table and the Subcategory cell in every
// month file that uses it. A Misc subcategory is not renamed on its own: it follows its category.
export async function planSubcategoryRename(ctx: PlanContext, oldName: string, newName: string): Promise<RenamePlan> {
	const owner = ctx.snapshot.categories.find((c) => hasSubcategory(c.category, oldName));
	if (!owner) throw new RenameError(`No subcategory named "${oldName}"`);
	if (oldName === newName) throw new RenameError("The new name is the same as the old one");
	if (oldName === miscName(owner.category.name)) throw new RenameError("A Misc subcategory is renamed together with its category");
	if (nameProblem(newName)) throw new RenameError(`"${newName}" is not a valid name`);
	if (!uniqueSubcategory(ctx, newName)) throw new RenameError(`A subcategory named "${newName}" already exists`);

	const content = renameSubcategoryRow(await ctx.read(owner.path), oldName, newName);
	return {
		changes: [
			{ fromPath: owner.path, toPath: owner.path, content },
			...(await renameSubcategoryInMonths(ctx, oldName, newName)),
			...(await renameSubcategoryInBudgets(ctx, oldName, newName)),
			...(await renameSubcategoryInAccounts(ctx, oldName, newName)),
		],
	};
}

// Renaming a category edits its note's name (moving it), its own Misc row, and the Misc name in
// every month file. Its other subcategories keep their names, so transactions need no other change.
export async function planCategoryRename(ctx: PlanContext, oldName: string, newName: string): Promise<RenamePlan> {
	const record = ctx.snapshot.categories.find((c) => c.category.name === oldName);
	if (!record) throw new RenameError(`No category named "${oldName}"`);
	if (oldName === newName) throw new RenameError("The new name is the same as the old one");
	if (nameProblem(newName)) throw new RenameError(`"${newName}" is not a valid name`);
	if (ctx.snapshot.categories.some((c) => c.category.name === newName)) throw new RenameError(`A category named "${newName}" already exists`);

	const oldMisc = miscName(oldName);
	const newMisc = miscName(newName);
	const hasMisc = hasSubcategory(record.category, oldMisc);
	if (hasMisc && !uniqueSubcategory(ctx, newMisc)) throw new RenameError(`A subcategory named "${newMisc}" already exists`);

	let content = patchProps(await ctx.read(record.path), { name: newName });
	if (hasMisc) content = renameSubcategoryRow(content, oldMisc, newMisc);

	const changes: FileChange[] = [{ fromPath: record.path, toPath: categoryPath(newName), content }];
	if (hasMisc) {
		changes.push(...(await renameSubcategoryInMonths(ctx, oldMisc, newMisc)));
		changes.push(...(await renameSubcategoryInBudgets(ctx, oldMisc, newMisc)));
		changes.push(...(await renameSubcategoryInAccounts(ctx, oldMisc, newMisc)));
	}
	return { changes };
}
