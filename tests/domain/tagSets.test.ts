import { describe, expect, it } from "vitest";
import { decodeTagSet, decodeTagSets, encodeTagSet, findTagSetByTags, removeTagSet, renameTagSet, saveTagSet } from "../../domain/tagSets";

const eating = { name: "Eating out", tags: ["dining", "publix"] };
const needs = { name: "Needs", tags: ["need"] };

describe("tag sets", () => {
	it("encodes and decodes", () => {
		expect(decodeTagSet(encodeTagSet(eating))).toEqual(eating);
	});

	it("drops malformed or empty entries", () => {
		expect(decodeTagSets(["nobar", "|a", "Name|", "Ok| A , a ,b"])).toEqual([{ name: "Ok", tags: ["a", "b"] }]);
	});

	it("saves a new set at the end and replaces a same-named one in place", () => {
		expect(saveTagSet([eating], needs)).toEqual([eating, needs]);
		expect(saveTagSet([eating, needs], { name: "Eating out", tags: ["x"] })).toEqual([{ name: "Eating out", tags: ["x"] }, needs]);
	});

	it("renames, replacing a set that already has the new name", () => {
		expect(renameTagSet([eating, needs], "Needs", "Core")).toEqual([eating, { name: "Core", tags: ["need"] }]);
		expect(renameTagSet([eating, needs], "Needs", "Eating out")).toEqual([{ name: "Eating out", tags: ["need"] }]);
	});

	it("removes by name", () => {
		expect(removeTagSet([eating, needs], "Eating out")).toEqual([needs]);
	});

	it("finds the set matching the chosen tags regardless of order", () => {
		expect(findTagSetByTags([eating, needs], new Set(["publix", "dining"]))).toBe(eating);
		expect(findTagSetByTags([eating, needs], new Set(["dining"]))).toBeUndefined();
	});
});
