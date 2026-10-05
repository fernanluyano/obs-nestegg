import { buildCategoryIndex, findDuplicateSubcategories } from "../domain/categories";
import type { Snapshot } from "../snapshot/snapshot";
import type { DuplicateNameIssue, DuplicateSubcategoryIssue, UnknownSubcategoryIssue } from "./issues";

export function detectDuplicateCategories(snapshot: Snapshot): DuplicateNameIssue[] {
	const byName = new Map<string, string[]>();
	for (const { path, category } of snapshot.categories) byName.set(category.name, [...(byName.get(category.name) ?? []), path]);
	return [...byName]
		.filter(([, paths]) => paths.length > 1)
		.map(([name, paths]) => ({ type: "duplicateName", kind: "category", name, paths }));
}

export function detectDuplicateSubcategories(snapshot: Snapshot): DuplicateSubcategoryIssue[] {
	const duplicates = findDuplicateSubcategories(snapshot.categories.map((c) => c.category));
	return [...duplicates].map(([subcategory, categories]) => ({ type: "duplicateSubcategory", subcategory, categories }));
}

export function detectUnknownSubcategories(snapshot: Snapshot): UnknownSubcategoryIssue[] {
	const index = buildCategoryIndex(snapshot.categories.map((c) => c.category));
	const unknown = new Map<string, { count: number; months: Set<string> }>();
	for (const m of snapshot.months) {
		for (const tx of m.transactions) {
			if (index.categoryOf(tx.subcategory)) continue;
			const entry = unknown.get(tx.subcategory) ?? { count: 0, months: new Set<string>() };
			entry.count++;
			entry.months.add(m.month);
			unknown.set(tx.subcategory, entry);
		}
	}
	return [...unknown].map(([subcategory, { count, months }]) => ({
		type: "unknownSubcategory",
		subcategory,
		transactionCount: count,
		months: [...months].sort(),
	}));
}
