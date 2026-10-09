import { nameProblem, miscName } from "../domain/names";
import { TRANSACTION_TYPES, type TransactionType } from "../domain/types";
import { addSubcategory, buildCategoryNote, removeSubcategoryRow, setSubcategoryTypeRow } from "../notes/categoryNote";
import { categoryPath } from "../notes/paths";
import { planCategoryRename, planSubcategoryRename } from "../rename/categoryRename";
import { executePlan } from "../rename/execute";
import { planSubcategoryMigration } from "../rename/subcategoryMigration";
import { subcategoryTypeLocked, subcategoryUsage } from "../snapshot/queries";
import { hasSubcategory } from "../domain/categories";
import { withMisc } from "../domain/defaults";
import { dropBudgetLines } from "./budgetLines";
import { clearPaymentLinks } from "./paymentLinks";
import { LedgerError } from "./errors";
import type { LedgerStore } from "./LedgerStore";

export class CategoryService {
	constructor(private store: LedgerStore) {}

	private categories() {
		return this.store.snapshot.categories;
	}

	private subcategoryTaken(name: string): boolean {
		return this.categories().some((c) => hasSubcategory(c.category, name));
	}

	private requireType(type: TransactionType): void {
		if (!TRANSACTION_TYPES.includes(type)) throw new LedgerError(`"${type}" is not a subcategory type`);
	}

	private requireName(name: string, what: string): void {
		if (nameProblem(name)) throw new LedgerError(`"${name}" is not a valid ${what} name`);
	}

	// A new category starts with its Misc subcategory, which takes `miscType`.
	async createCategory(name: string, miscType: TransactionType): Promise<void> {
		this.requireName(name, "category");
		this.requireType(miscType);
		if (this.categories().some((c) => c.category.name === name)) throw new LedgerError(`A category named "${name}" already exists`);
		if (this.subcategoryTaken(miscName(name))) throw new LedgerError(`A subcategory named "${miscName(name)}" already exists`);

		await this.store.port.create(categoryPath(name), buildCategoryNote(withMisc(name, miscType, [])));
		await this.store.reload();
	}

	// Only a subcategory nothing uses can change type. Its planned line stays, so it is back if it
	// changes again, and is only shown while the subcategory is a budgeted one.
	async setSubcategoryType(subcategory: string, type: TransactionType): Promise<void> {
		const record = this.categories().find((c) => hasSubcategory(c.category, subcategory));
		if (!record) throw new LedgerError(`No subcategory named "${subcategory}"`);
		this.requireType(type);
		if (record.category.subcategories.find((s) => s.name === subcategory)!.type === type) return;
		if (subcategoryTypeLocked(this.store.snapshot, subcategory)) {
			throw new LedgerError("Transactions still use this subcategory, so its type cannot change. Move them to another subcategory first.");
		}

		await this.store.port.modify(record.path, (c) => setSubcategoryTypeRow(c, subcategory, type));
		// A subcategory that stops being a debt payment is no longer a loan's payment category.
		await clearPaymentLinks(this.store, [subcategory]);
		await this.store.reload();
	}

	async addSubcategory(category: string, name: string, type: TransactionType): Promise<void> {
		const record = this.categories().find((c) => c.category.name === category);
		if (!record) throw new LedgerError(`No category named "${category}"`);
		this.requireName(name, "subcategory");
		this.requireType(type);
		if (this.subcategoryTaken(name)) throw new LedgerError(`A subcategory named "${name}" already exists`);

		await this.store.port.modify(record.path, (c) => addSubcategory(c, name, type));
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
		const record = this.categories().find((c) => hasSubcategory(c.category, name));
		if (!record) throw new LedgerError(`No subcategory named "${name}"`);
		if (name === miscName(record.category.name)) throw new LedgerError("A category's Misc subcategory cannot be removed");
		await this.migrateUsage([name], "subcategory", migrateTo);

		await this.store.port.modify(record.path, (c) => removeSubcategoryRow(c, name));
		await dropBudgetLines(this.store, [name]);
		await clearPaymentLinks(this.store, [name]);
		await this.store.reload();
	}

	async removeCategory(name: string, migrateTo?: string): Promise<void> {
		const record = this.categories().find((c) => c.category.name === name);
		if (!record) throw new LedgerError(`No category named "${name}"`);
		const removed = record.category.subcategories.map((s) => s.name);
		await this.migrateUsage(removed, "category", migrateTo);

		await this.store.port.trash(record.path);
		await dropBudgetLines(this.store, removed);
		await clearPaymentLinks(this.store, removed);
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
