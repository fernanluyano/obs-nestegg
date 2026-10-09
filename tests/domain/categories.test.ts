import { describe, expect, it } from "vitest";
import { buildCategoryIndex, findDuplicateSubcategories, hasSubcategory, migrationTargets, sortSubcategories, subcategoryOptions } from "../../domain/categories";
import type { Subcategory } from "../../domain/types";
import { category } from "../helpers/fixtures";

const categories = [
	category("Food", "expense", ["Groceries", "Food - Misc"]),
	category("Income", "income", ["Salary", "Income - Misc"]),
	category("Transfers", "transfer", ["Account transfer"]),
];

const subs = (...names: string[]): Subcategory[] => names.map((name) => ({ name, type: "expense" }));
const names = (list: Subcategory[]) => list.map((s) => s.name);

describe("sortSubcategories", () => {
	it("sorts by name ignoring case, with the category's Misc last", () => {
		expect(names(sortSubcategories("Food", subs("Food - Misc", "Restaurants", "apples", "Groceries")))).toEqual(["apples", "Groceries", "Restaurants", "Food - Misc"]);
	});

	it("only treats its own category's Misc as the catch-all and does not change the input", () => {
		const input = subs("Zoo", "Other - Misc", "Food - Misc");
		expect(names(sortSubcategories("Food", input))).toEqual(["Other - Misc", "Zoo", "Food - Misc"]);
		expect(names(input)).toEqual(["Zoo", "Other - Misc", "Food - Misc"]);
	});

	it("keeps each subcategory's type", () => {
		const sorted = sortSubcategories("Food", [{ name: "b", type: "income" }, { name: "a", type: "transfer" }]);
		expect(sorted).toEqual([{ name: "a", type: "transfer" }, { name: "b", type: "income" }]);
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

	it("offers Credit card payment like any other transfer subcategory", () => {
		const withCard = [category("Transfers", "transfer", ["Account transfer", "Credit card payment", "Other move"])];
		expect(migrationTargets(withCard, "transfer", ["Account transfer"]).map((o) => o.subcategory)).toEqual(["Credit card payment", "Other move"]);
	});

	it("looks at the subcategory's own type, not its category's", () => {
		const mixed = [category("Home", "expense", ["Rent", ["Rental income", "income"], ["Deposit refund", "income"]])];
		expect(migrationTargets(mixed, "income", ["Rental income"]).map((o) => o.subcategory)).toEqual(["Deposit refund"]);
		expect(migrationTargets(mixed, "expense", ["Rent"])).toEqual([]);
	});
});

describe("buildCategoryIndex", () => {
	const index = buildCategoryIndex(categories);

	it("derives the category and type from a subcategory", () => {
		expect(index.categoryOf("Groceries")?.name).toBe("Food");
		expect(index.typeOf("Salary")).toBe("income");
		expect(index.typeOf("Account transfer")).toBe("transfer");
	});

	it("gives each subcategory of one category its own type", () => {
		const mixed = buildCategoryIndex([category("Home", "expense", ["Rent", ["Rental income", "income"], ["Move", "transfer"]])]);
		expect(mixed.typeOf("Rent")).toBe("expense");
		expect(mixed.typeOf("Rental income")).toBe("income");
		expect(mixed.typeOf("Move")).toBe("transfer");
		expect(mixed.categoryOf("Rental income")?.name).toBe("Home");
	});

	it("returns undefined for unknown subcategories", () => {
		expect(index.categoryOf("Nope")).toBeUndefined();
		expect(index.typeOf("Nope")).toBeUndefined();
	});

	it("keeps the first owner when a name is duplicated", () => {
		const dup = buildCategoryIndex([category("A", "expense", ["X"]), category("B", "income", ["X"])]);
		expect(dup.categoryOf("X")?.name).toBe("A");
		expect(dup.typeOf("X")).toBe("expense");
	});
});

describe("hasSubcategory", () => {
	it("matches on the subcategory's name", () => {
		expect(hasSubcategory(categories[0], "Groceries")).toBe(true);
		expect(hasSubcategory(categories[0], "Salary")).toBe(false);
	});
});

describe("subcategoryOptions", () => {
	it("lists every subcategory with its category", () => {
		expect(subcategoryOptions(categories)).toHaveLength(5);
	});

	it("filters by subcategory type", () => {
		expect(subcategoryOptions(categories, "income")).toEqual([
			{ category: "Income", subcategory: "Salary" },
			{ category: "Income", subcategory: "Income - Misc" },
		]);
	});

	it("filters inside a category that holds several types", () => {
		const mixed = [category("Home", "expense", ["Rent", ["Rental income", "income"]])];
		expect(subcategoryOptions(mixed, "income")).toEqual([{ category: "Home", subcategory: "Rental income" }]);
	});
});

describe("findDuplicateSubcategories", () => {
	it("is empty when every name is unique", () => {
		expect(findDuplicateSubcategories(categories).size).toBe(0);
	});

	it("reports names shared across categories", () => {
		const dup = findDuplicateSubcategories([category("A", "expense", ["X", "Y"]), category("B", "income", ["X"])]);
		expect([...dup]).toEqual([["X", ["A", "B"]]]);
	});

	it("reports a name repeated inside one category", () => {
		const dup = findDuplicateSubcategories([category("A", "expense", ["X", "X"])]);
		expect(dup.get("X")).toEqual(["A", "A"]);
	});
});
