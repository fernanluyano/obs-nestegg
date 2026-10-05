import { describe, expect, it } from "vitest";
import { miscName, nameProblem, normalizeTag, normalizeTags } from "../../domain/names";

describe("nameProblem", () => {
	it("accepts ordinary names", () => {
		expect(nameProblem("Cash Main")).toBeNull();
		expect(nameProblem("Food - Misc")).toBeNull();
	});

	it("flags empty and whitespace-only names", () => {
		expect(nameProblem("")).toBe("empty");
		expect(nameProblem("   ")).toBe("empty");
	});

	it.each(["a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b", "a#b", "a^b", "a[b", "a]b"])(
		"flags %s",
		(name) => expect(nameProblem(name)).toBe("invalid"),
	);

	it("flags leading dots and surrounding whitespace", () => {
		expect(nameProblem(".hidden")).toBe("invalid");
		expect(nameProblem(" Cash")).toBe("invalid");
		expect(nameProblem("Cash ")).toBe("invalid");
	});
});

describe("miscName", () => {
	it("builds the default subcategory name from the category", () => {
		expect(miscName("Food")).toBe("Food - Misc");
	});
});

describe("normalizeTag", () => {
	it("lowercases, trims and strips a leading hash", () => {
		expect(normalizeTag("  #Gift ")).toBe("gift");
		expect(normalizeTag("BirthDay")).toBe("birthday");
	});

	it("returns empty for blanks", () => {
		expect(normalizeTag(" # ")).toBe("");
	});
});

describe("normalizeTags", () => {
	it("normalizes, drops blanks and removes duplicates keeping order", () => {
		expect(normalizeTags(["Gift", "gift", "#Weekly", " ", "b", "weekly"])).toEqual(["gift", "weekly", "b"]);
	});

	it("handles an empty list", () => {
		expect(normalizeTags([])).toEqual([]);
	});
});
