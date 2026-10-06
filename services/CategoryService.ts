import { nameProblem, miscName } from "../domain/names";
import { TRANSACTION_TYPES, type TransactionType } from "../domain/types";
import { addSubcategory, buildCategoryNote, removeSubcategoryRow } from "../notes/categoryNote";
import { categoryPath } from "../notes/paths";
import { planCategoryRename, planSubcategoryRename } from "../rename/categoryRename";
import { executePlan } from "../rename/execute";
import { planSubcategoryMigration } from "../rename/subcategoryMigration";
import { patchProps } from "../notes/frontmatter";
import { categoryTypeChangeProblem, subcategoryUsage, type CategoryTypeProblem } from "../snapshot/queries";
import { withMisc } from "../domain/defaults";
import { dropBudgetLines } from "./budgetLines";
import { LedgerError } from "./errors";
import type { LedgerStore } from "./LedgerStore";

const TYPE_CHANGE_PROBLEMS: Record<CategoryTypeProblem, string> = {
	used: "Transactions still use this category, so its type cannot change. Move them to another subcategory first.",
	cardPayment: "This category holds Credit card payment, which only works under a transfer.",
};

export class CategoryService {
	constructor(private store: LedgerStore) {}

	private categories() {
		return this.store.snapshot.categories;
	}

	private subcategoryTaken(name: string): boolean {
		return this.categories().some((c) => c.category.subcategories.includes(name));
	}

	private requireName(name: string, what: string): void {
		if (nameProblem(name)) throw new LedgerError(`"${name}" is not a valid ${what} name`);
	}

	async createCategory(name: string, categoryType: TransactionType): Promise<void> {
		this.requireName(name, "category");
		if (this.categories().some((c) => c.category.name === name)) throw new LedgerError(`A category named "${name}" already exists`);
		if (this.subcategoryTaken(miscName(name))) throw new LedgerError(`A subcategory named "${miscName(name)}" already exists`);

		await this.store.port.create(categoryPath(name), buildCategoryNote(withMisc(name, categoryType, [])));
		await this.store.reload();
	}

	// Only a category nothing uses can change type. Transfers are not budgeted, so a category that
	// becomes one loses its planned lines.
	async setCategoryType(name: string, categoryType: TransactionType): Promise<void> {
		const record = this.categories().find((c) => c.category.name === name);
		if (!record) throw new LedgerError(`No category named "${name}"`);
		if (!TRANSACTION_TYPES.includes(categoryType)) throw new LedgerError(`"${categoryType}" is not a category type`);
		if (record.category.categoryType === categoryType) return;
		const problem = categoryTypeChangeProblem(this.store.snapshot, name);
		if (problem) throw new LedgerError(TYPE_CHANGE_PROBLEMS[problem]);

		await this.store.port.modify(record.path, (c) => patchProps(c, { categoryType }));
		if (categoryType === "transfer") await dropBudgetLines(this.store, record.category.subcategories);
		await this.store.reload();
	}

	async addSubcategory(category: string, name: string): Promise<void> {
		const record = this.categories().find((c) => c.category.name === category);
		if (!record) throw new LedgerError(`No category named "${category}"`);
		this.requireName(name, "subcategory");
		if (this.subcategoryTaken(name)) throw new LedgerError(`A subcategory named "${name}" already exists`);

		await this.store.port.modify(record.path, (c) => addSubcategory(c, name));
		await this.store.reload();
	}

	async renameSubcategory(oldName: string, newName: string): Promise<void> {
		await this.runPlan(planSubcategoryRename(this.planContext(), oldName, newName));
	}

	async renameCategory(oldName: string, newName: string): Promise<void> {
		await this.runPlan(planCategoryRename(this.planContext(), oldName, newName));
	}

	// Transactions that still use what is being removed must be pointed somewhere first: pass the
	// subcategory they should move to, or the removal is refused.
	private async migrateUsage(removed: string[], what: string, migrateTo?: string): Promise<void> {
		if (!removed.some((s) => subcategoryUsage(this.store.snapshot, s) > 0)) return;
		if (!migrateTo) throw new LedgerError(`Transactions still use this ${what}`);
		await this.runPlan(planSubcategoryMigration(this.planContext(), removed, migrateTo));
	}

	async removeSubcategory(name: string, migrateTo?: string): Promise<void> {
		const record = this.categories().find((c) => c.category.subcategories.includes(name));
		if (!record) throw new LedgerError(`No subcategory named "${name}"`);
		if (name === miscName(record.category.name)) throw new LedgerError("A category's Misc subcategory cannot be removed");
		await this.migrateUsage([name], "subcategory", migrateTo);

		await this.store.port.modify(record.path, (c) => removeSubcategoryRow(c, name));
		await dropBudgetLines(this.store, [name]);
		await this.store.reload();
	}

	async removeCategory(name: string, migrateTo?: string): Promise<void> {
		const record = this.categories().find((c) => c.category.name === name);
		if (!record) throw new LedgerError(`No category named "${name}"`);
		await this.migrateUsage(record.category.subcategories, "category", migrateTo);

		await this.store.port.trash(record.path);
		await dropBudgetLines(this.store, record.category.subcategories);
		await this.store.reload();
	}

	private planContext() {
		const { snapshot, port } = this.store;
		return { snapshot, read: async (p: string) => (await port.read(p)) ?? "" };
	}

	private async runPlan(plan: ReturnType<typeof planCategoryRename>): Promise<void> {
		await executePlan(this.store.port, await plan);
		await this.store.reload();
	}
}
