import type { Category, TransactionType } from "./types";

export interface CategoryIndex {
	categoryOf(subcategory: string): Category | undefined;
	typeOf(subcategory: string): TransactionType | undefined;
}

// Subcategory names are unique across categories, so the first match is the only one.
// Duplicates are a validation error, not something this lookup has to arbitrate.
export function buildCategoryIndex(categories: Category[]): CategoryIndex {
	const bySubcategory = new Map<string, Category>();
	for (const category of categories) {
		for (const sub of category.subcategories) {
			if (!bySubcategory.has(sub)) bySubcategory.set(sub, category);
		}
	}
	return {
		categoryOf: (sub) => bySubcategory.get(sub),
		typeOf: (sub) => bySubcategory.get(sub)?.categoryType,
	};
}

export interface SubcategoryOption {
	category: string;
	subcategory: string;
}

export function subcategoryOptions(categories: Category[], type?: TransactionType): SubcategoryOption[] {
	return categories
		.filter((c) => type === undefined || c.categoryType === type)
		.flatMap((c) => c.subcategories.map((subcategory) => ({ category: c.name, subcategory })));
}

export function findDuplicateSubcategories(categories: Category[]): Map<string, string[]> {
	const owners = new Map<string, string[]>();
	for (const category of categories) {
		for (const sub of category.subcategories) {
			owners.set(sub, [...(owners.get(sub) ?? []), category.name]);
		}
	}
	for (const [sub, names] of [...owners]) if (names.length < 2) owners.delete(sub);
	return owners;
}
