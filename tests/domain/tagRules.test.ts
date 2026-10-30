import { describe, expect, it } from "vitest";
import { tagProblem } from "../../domain/tagRules";

describe("tagProblem", () => {
	it("accepts no tags, and valid ones including a single need or want", () => {
		expect(tagProblem([])).toBeNull();
		expect(tagProblem(["need"])).toBeNull();
		expect(tagProblem(["want", "trip-2026", "q3"])).toBeNull();
	});

	it("requires need or want only when asked to", () => {
		expect(tagProblem([])).toBeNull();
		expect(tagProblem([], { requireNeedOrWant: true })).toBe("missingNeedWant");
		expect(tagProblem(["trip"], { requireNeedOrWant: true })).toBe("missingNeedWant");
		expect(tagProblem(["Want", "trip"], { requireNeedOrWant: true })).toBeNull();
		expect(tagProblem(["need"], { requireNeedOrWant: true })).toBeNull();
	});

	it("rejects a tag over 16 characters", () => {
		expect(tagProblem(["abcdefghijklmnop"])).toBeNull();
		expect(tagProblem(["abcdefghijklmnopq"])).toBe("tooLong");
	});

	it("rejects characters other than letters, digits and dashes, and empty tags", () => {
		expect(tagProblem(["two words"])).toBe("invalid");
		expect(tagProblem(["a,b"])).toBe("invalid");
		expect(tagProblem(["under_score"])).toBe("invalid");
		expect(tagProblem([""])).toBe("invalid");
	});

	it("rejects the same tag twice, in any case", () => {
		expect(tagProblem(["gift", "gift"])).toBe("duplicate");
		expect(tagProblem(["Gift", "gift"])).toBe("duplicate");
	});

	it("rejects more than 3 tags", () => {
		expect(tagProblem(["a", "b", "c"])).toBeNull();
		expect(tagProblem(["a", "b", "c", "d"])).toBe("tooMany");
	});

	it("rejects need and want together, in any case and order", () => {
		expect(tagProblem(["need", "want"])).toBe("needAndWant");
		expect(tagProblem(["trip", "Want", "NEED"])).toBe("needAndWant");
	});
});
