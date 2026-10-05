import { nameProblem, miscName } from "../domain/names";
import type { TransactionType } from "../domain/types";
import { addSubcategory, buildCategoryNote, removeSubcategoryRow } from "../notes/categoryNote";
import { categoryPath } from "../notes/paths";
import { planCategoryRename, planSubcategoryRename } from "../rename/categoryRename";
import { executePlan } from "../rename/execute";
import { subcategoryUsage } from "../snapshot/queries";
import { withMisc } from "../domain/defaults";
import { LedgerError } from "./errors";
import type { LedgerStore } from "./LedgerStore";

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

	async removeSubcategory(name: string): Promise<void> {
		const record = this.categories().find((c) => c.category.subcategories.includes(name));
		if (!record) throw new LedgerError(`No subcategory named "${name}"`);
		if (name === miscName(record.category.name)) throw new LedgerError("A category's Misc subcategory cannot be removed");
		if (subcategoryUsage(this.store.snapshot, name) > 0) throw new LedgerError("Transactions still use this subcategory");

		await this.store.port.modify(record.path, (c) => removeSubcategoryRow(c, name));
		await this.store.reload();
	}

	async removeCategory(name: string): Promise<void> {
		const record = this.categories().find((c) => c.category.name === name);
		if (!record) throw new LedgerError(`No category named "${name}"`);
		const used = record.category.subcategories.some((s) => subcategoryUsage(this.store.snapshot, s) > 0);
		if (used) throw new LedgerError("Transactions still use this category");

		await this.store.port.trash(record.path);
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
