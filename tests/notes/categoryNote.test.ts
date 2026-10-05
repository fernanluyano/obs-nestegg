import { describe, expect, it } from "vitest";
import {
	addSubcategory, buildCategoryNote, parseCategoryNote, removeSubcategoryRow, renameSubcategoryRow,
} from "../../notes/categoryNote";
import { parseProps } from "../../notes/frontmatter";
import type { Category } from "../../domain/types";

const food: Category = { name: "Food", categoryType: "expense", subcategories: ["Groceries", "Restaurants", "Food - Misc"] };

describe("buildCategoryNote / parseCategoryNote", () => {
	it("round trips a category", () => {
		const note = buildCategoryNote(food);
		expect(parseCategoryNote(parseProps(note), note)).toEqual({ ok: true, category: food, tableIssues: [] });
	});

	it("writes the layout from the design", () => {
		expect(buildCategoryNote(food)).toBe(
			"---\ntags: [nestegg/category]\nstate: current\nname: Food\ncategoryType: expense\n---\n\n" +
				"| Subcategory |\n|---|\n| Groceries |\n| Restaurants |\n| Food - Misc |\n",
		);
	});

	it("escapes pipes in subcategory names and reads them back", () => {
		const odd = { ...food, subcategories: ["A|B"] };
		const note = buildCategoryNote(odd);
		expect(parseCategoryNote(parseProps(note), note)).toMatchObject({ ok: true, category: { subcategories: ["A|B"] } });
	});

	it("reads a note with prose and padded cells", () => {
		const note = "---\nname: Food\ncategoryType: expense\n---\nIntro text\n\n|  Subcategory  |\n| ------------- |\n|  Groceries  |\n\nMore text\n";
		expect(parseCategoryNote(parseProps(note), note)).toMatchObject({ ok: true, category: { subcategories: ["Groceries"] } });
	});

	it("skips blank rows and reports malformed ones", () => {
		const note = "---\nname: Food\ncategoryType: expense\n---\n| Subcategory |\n|---|\n| A |\n|  |\n| B | extra |\n";
		const parsed = parseCategoryNote(parseProps(note), note);
		expect(parsed).toMatchObject({ ok: true, category: { subcategories: ["A"] } });
		expect(parsed.ok && parsed.tableIssues).toHaveLength(1);
	});

	it("has no subcategories when the note has no table", () => {
		const note = "---\nname: Food\ncategoryType: expense\n---\n";
		expect(parseCategoryNote(parseProps(note), note)).toMatchObject({ ok: true, category: { subcategories: [] } });
	});

	it("rejects a missing name or a bad type", () => {
		expect(parseCategoryNote({ categoryType: "expense" }, "")).toMatchObject({ ok: false });
		expect(parseCategoryNote({ name: "x", categoryType: "other" }, "")).toMatchObject({ ok: false });
		expect(parseCategoryNote({ name: "x" }, "")).toMatchObject({ ok: false });
	});
});

describe("note edits", () => {
	const note = buildCategoryNote(food);

	it("adds a subcategory row", () => {
		const next = addSubcategory(note, "Coffee");
		expect(next).toBe(note + "| Coffee |\n");
	});

	it("creates the table when the note has none", () => {
		const bare = "---\nname: Food\ncategoryType: expense\n---";
		const next = addSubcategory(bare, "Coffee");
		expect(parseCategoryNote(parseProps(next), next)).toMatchObject({ category: { subcategories: ["Coffee"] } });
		expect(addSubcategory("", "A")).toBe("\n| Subcategory |\n|---|\n| A |\n");
	});

	it("renames one row without touching the others", () => {
		const next = renameSubcategoryRow(note, "Groceries", "Supermarket");
		expect(next).toBe(note.replace("| Groceries |", "| Supermarket |"));
		expect(renameSubcategoryRow(note, "Nope", "X")).toBe(note);
	});

	it("removes one row", () => {
		expect(removeSubcategoryRow(note, "Restaurants")).toBe(note.replace("| Restaurants |\n", ""));
		expect(removeSubcategoryRow(note, "Nope")).toBe(note);
		expect(removeSubcategoryRow("no table", "x")).toBe("no table");
	});

	it("refuses to rewrite a table with unreadable rows", () => {
		const broken = note + "| a | b |\n";
		expect(() => addSubcategory(broken, "X")).toThrow(/unreadable/);
	});
});
