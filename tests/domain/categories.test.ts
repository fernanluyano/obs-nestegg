import { describe, expect, it } from "vitest";
import { buildCategoryIndex, findDuplicateSubcategories, subcategoryOptions } from "../../domain/categories";
import type { Category } from "../../domain/types";

const categories: Category[] = [
	{ name: "Food", categoryType: "expense", subcategories: ["Groceries", "Food - Misc"] },
	{ name: "Income", categoryType: "income", subcategories: ["Salary", "Income - Misc"] },
	{ name: "Transfers", categoryType: "transfer", subcategories: ["Account transfer"] },
];

describe("buildCategoryIndex", () => {
	const index = buildCategoryIndex(categories);

	it("derives the category and type from a subcategory", () => {
		expect(index.categoryOf("Groceries")?.name).toBe("Food");
		expect(index.typeOf("Salary")).toBe("income");
		expect(index.typeOf("Account transfer")).toBe("transfer");
	});

	it("returns undefined for unknown subcategories", () => {
		expect(index.categoryOf("Nope")).toBeUndefined();
		expect(index.typeOf("Nope")).toBeUndefined();
	});

	it("keeps the first owner when a name is duplicated", () => {
		const dup = buildCategoryIndex([
			{ name: "A", categoryType: "expense", subcategories: ["X"] },
			{ name: "B", categoryType: "income", subcategories: ["X"] },
		]);
		expect(dup.categoryOf("X")?.name).toBe("A");
	});
});

describe("subcategoryOptions", () => {
	it("lists every subcategory with its category", () => {
		expect(subcategoryOptions(categories)).toHaveLength(5);
	});

	it("filters by category type", () => {
		expect(subcategoryOptions(categories, "income")).toEqual([
			{ category: "Income", subcategory: "Salary" },
			{ category: "Income", subcategory: "Income - Misc" },
		]);
	});
});

describe("findDuplicateSubcategories", () => {
	it("is empty when every name is unique", () => {
		expect(findDuplicateSubcategories(categories).size).toBe(0);
	});

	it("reports names shared across categories", () => {
		const dup = findDuplicateSubcategories([
			{ name: "A", categoryType: "expense", subcategories: ["X", "Y"] },
			{ name: "B", categoryType: "income", subcategories: ["X"] },
		]);
		expect([...dup]).toEqual([["X", ["A", "B"]]]);
	});

	it("reports a name repeated inside one category", () => {
		const dup = findDuplicateSubcategories([{ name: "A", categoryType: "expense", subcategories: ["X", "X"] }]);
		expect(dup.get("X")).toEqual(["A", "A"]);
	});
});
