import { miscName } from "./names";
import type { Category, Subcategory, TransactionType } from "./types";

export interface CategoryIndex {
	categoryOf(subcategory: string): Category | undefined;
	typeOf(subcategory: string): TransactionType | undefined;
}

// Subcategory names are unique across categories, so the first match is the only one.
// Duplicates are a validation error, not something this lookup has to arbitrate.
export function buildCategoryIndex(categories: Category[]): CategoryIndex {
	const bySubcategory = new Map<string, { category: Category; type: TransactionType }>();
	for (const category of categories) {
		for (const sub of category.subcategories) {
			if (!bySubcategory.has(sub.name)) bySubcategory.set(sub.name, { category, type: sub.type });
		}
	}
	return {
		categoryOf: (sub) => bySubcategory.get(sub)?.category,
		typeOf: (sub) => bySubcategory.get(sub)?.type,
	};
}

export const hasSubcategory = (category: Category, name: string): boolean => category.subcategories.some((s) => s.name === name);

// Alphabetical, with the category's own Misc catch-all last. Only the order shown changes; the
// category note keeps its rows as they were written.
export function sortSubcategories(category: string, subcategories: Subcategory[]): Subcategory[] {
	const misc = miscName(category);
	return [...subcategories].sort((a, b) => Number(a.name === misc) - Number(b.name === misc) || a.name.localeCompare(b.name));
}

export interface SubcategoryOption {
	category: string;
	subcategory: string;
}

export function subcategoryOptions(categories: Category[], type?: TransactionType): SubcategoryOption[] {
	return categories.flatMap((c) =>
		c.subcategories.filter((s) => type === undefined || s.type === type).map((s) => ({ category: c.name, subcategory: s.name })),
	);
}

// Where transactions can go when their subcategory is removed: another subcategory of the same
// type, so signs, month totals and budgets keep their meaning.
export function migrationTargets(categories: Category[], type: TransactionType, removed: string[]): SubcategoryOption[] {
	return subcategoryOptions(categories, type).filter((o) => !removed.includes(o.subcategory));
}

export function findDuplicateSubcategories(categories: Category[]): Map<string, string[]> {
	const owners = new Map<string, string[]>();
	for (const category of categories) {
		for (const sub of category.subcategories) {
			owners.set(sub.name, [...(owners.get(sub.name) ?? []), category.name]);
		}
	}
	for (const [sub, names] of [...owners]) if (names.length < 2) owners.delete(sub);
	return owners;
}
