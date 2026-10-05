import { describe, expect, it } from "vitest";
import { findDuplicateSubcategories } from "../../domain/categories";
import { DEFAULT_SETTINGS, DEFAULT_TAGS, defaultCategories, withMisc } from "../../domain/defaults";
import { miscName, nameProblem, normalizeTag } from "../../domain/names";
import { TAG_LIMIT } from "../../modal/transactionState";
import { validateTag } from "../../utils";

describe("withMisc", () => {
	it("appends the category's own Misc subcategory", () => {
		expect(withMisc("Food", "expense", ["Groceries"])).toEqual({
			name: "Food", categoryType: "expense", subcategories: ["Groceries", "Food - Misc"],
		});
	});
});

describe("defaultCategories", () => {
	const categories = defaultCategories();

	it("gives every category a Misc subcategory", () => {
		for (const c of categories) expect(c.subcategories).toContain(miscName(c.name));
	});

	it("keeps subcategory names unique across categories", () => {
		expect(findDuplicateSubcategories(categories).size).toBe(0);
	});

	it("uses only valid names and covers all three types", () => {
		for (const c of categories) {
			expect(nameProblem(c.name)).toBeNull();
			for (const s of c.subcategories) expect(nameProblem(s)).toBeNull();
		}
		expect(new Set(categories.map((c) => c.categoryType))).toEqual(new Set(["expense", "income", "transfer"]));
	});
});

describe("DEFAULT_TAGS", () => {
	it("are the need and want tags", () => {
		expect(DEFAULT_TAGS).toEqual(["need", "want"]);
	});

	it("already satisfy the tag rules, so a user can pick them without them being rejected", () => {
		for (const tag of DEFAULT_TAGS) {
			expect(normalizeTag(tag)).toBe(tag);
			expect(validateTag(tag)).toBe(true);
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
