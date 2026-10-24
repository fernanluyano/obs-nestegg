import { describe, expect, it } from "vitest";
import { findDuplicateSubcategories } from "../../domain/categories";
import { DEFAULT_SETTINGS, DEFAULT_TAGS, defaultCategories, withMisc } from "../../domain/defaults";
import { miscName, nameProblem, normalizeTag } from "../../domain/names";
import { TAG_LIMIT } from "../../modal/entryDraft";
import { isValidTag } from "../../helpers";

describe("withMisc", () => {
	it("appends the category's own Misc subcategory", () => {
		expect(withMisc("Food", "expense", ["Groceries"])).toEqual({
			name: "Food", subcategories: [{ name: "Groceries", type: "expense" }, { name: "Food - Misc", type: "expense" }],
		});
	});

	it("gives the subcategories and the Misc the type it is given", () => {
		for (const s of withMisc("Pay", "income", ["Salary"]).subcategories) expect(s.type).toBe("income");
	});
});

describe("defaultCategories", () => {
	const categories = defaultCategories();

	it("gives every category a Misc subcategory", () => {
		for (const c of categories) expect(c.subcategories.map((s) => s.name)).toContain(miscName(c.name));
	});

	it("keeps subcategory names unique across categories", () => {
		expect(findDuplicateSubcategories(categories).size).toBe(0);
	});

	it("uses only valid names and covers all four types", () => {
		for (const c of categories) {
			expect(nameProblem(c.name)).toBeNull();
			for (const s of c.subcategories) expect(nameProblem(s.name)).toBeNull();
		}
		expect(new Set(categories.flatMap((c) => c.subcategories.map((s) => s.type)))).toEqual(new Set(["expense", "income", "transfer", "debt"]));
	});
});

describe("DEFAULT_TAGS", () => {
	it("are the need and want tags", () => {
		expect(DEFAULT_TAGS).toEqual(["need", "want"]);
	});

	it("already satisfy the tag rules, so a user can pick them without them being rejected", () => {
		for (const tag of DEFAULT_TAGS) {
			expect(normalizeTag(tag)).toBe(tag);
			expect(isValidTag(tag)).toBe(true);
		}
		expect(new Set(DEFAULT_TAGS).size).toBe(DEFAULT_TAGS.length);
		expect(DEFAULT_TAGS.length).toBeLessThanOrEqual(TAG_LIMIT);
	});
});

describe("defaults", () => {
	it("starts with no default account and validation on", () => {
		expect(DEFAULT_SETTINGS).toEqual({ defaultAccount: "", autoValidateOnLoad: true });
	});
});
