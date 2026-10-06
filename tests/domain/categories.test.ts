import { describe, expect, it } from "vitest";
import { buildCategoryIndex, findDuplicateSubcategories, migrationTargets, sortSubcategories, subcategoryOptions } from "../../domain/categories";
import type { Category } from "../../domain/types";

const categories: Category[] = [
	{ name: "Food", categoryType: "expense", subcategories: ["Groceries", "Food - Misc"] },
	{ name: "Income", categoryType: "income", subcategories: ["Salary", "Income - Misc"] },
	{ name: "Transfers", categoryType: "transfer", subcategories: ["Account transfer"] },
];

describe("sortSubcategories", () => {
	it("sorts by name ignoring case, with the category's Misc last", () => {
		expect(sortSubcategories("Food", ["Food - Misc", "Restaurants", "apples", "Groceries"])).toEqual(["apples", "Groceries", "Restaurants", "Food - Misc"]);
	});

	it("only treats its own category's Misc as the catch-all and does not change the input", () => {
		const input = ["Zoo", "Other - Misc", "Food - Misc"];
		expect(sortSubcategories("Food", input)).toEqual(["Food - Misc".replace("Food - Misc", "Other - Misc"), "Zoo", "Food - Misc"]);
		expect(input).toEqual(["Zoo", "Other - Misc", "Food - Misc"]);
	});
});

describe("migrationTargets", () => {
	it("offers the other subcategories of the same type, including Misc", () => {
		expect(migrationTargets(categories, "expense", ["Groceries"]).map((o) => o.subcategory)).toEqual(["Food - Misc"]);
		expect(migrationTargets(categories, "income", ["Salary"]).map((o) => o.subcategory)).toEqual(["Income - Misc"]);
	});

	it("leaves out everything being removed and says which category each belongs to", () => {
		expect(migrationTargets(categories, "expense", ["Groceries", "Food - Misc"])).toEqual([]);
		expect(migrationTargets(categories, "income", [])[0]).toEqual({ category: "Income", subcategory: "Salary" });
	});

	it("never offers Credit card payment", () => {
		const withCard: Category[] = [{ name: "Transfers", categoryType: "transfer", subcategories: ["Account transfer", "Credit card payment", "Other move"] }];
		expect(migrationTargets(withCard, "transfer", ["Account transfer"]).map((o) => o.subcategory)).toEqual(["Other move"]);
	});
});

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
