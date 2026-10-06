import { CREDIT_CARD_PAYMENT } from "./defaults";
import { miscName } from "./names";
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

// Alphabetical, with the category's own Misc catch-all last. Only the order shown changes; the
// category note keeps its rows as they were written.
export function sortSubcategories(category: string, subcategories: string[]): string[] {
	const misc = miscName(category);
	return [...subcategories].sort((a, b) => Number(a === misc) - Number(b === misc) || a.localeCompare(b));
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

// Where transactions can go when their subcategory is removed: another subcategory of the same
// type, so signs, month totals and budgets keep their meaning. Credit card payment is left out
// because only rows between a cash account and a card are valid under it.
export function migrationTargets(categories: Category[], type: TransactionType, removed: string[]): SubcategoryOption[] {
	return subcategoryOptions(categories, type).filter((o) => !removed.includes(o.subcategory) && o.subcategory !== CREDIT_CARD_PAYMENT);
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
