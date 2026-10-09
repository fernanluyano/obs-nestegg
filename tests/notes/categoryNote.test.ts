import { describe, expect, it } from "vitest";
import {
	addSubcategory, buildCategoryNote, parseCategoryNote, removeSubcategoryRow, renameSubcategoryRow, setSubcategoryTypeRow,
} from "../../notes/categoryNote";
import { parseProps } from "../../notes/frontmatter";
import { category } from "../helpers/fixtures";

const food = category("Food", "expense", ["Groceries", "Restaurants", "Food - Misc"]);
const names = (parsed: ReturnType<typeof parseCategoryNote>) => (parsed.ok ? parsed.category.subcategories.map((s) => s.name) : []);

describe("parseCategoryNote ordering", () => {
	it("reads subcategories alphabetically with Misc last, leaving the note as written", () => {
		const note = buildCategoryNote(category("Food", "expense", ["Food - Misc", "Restaurants", "coffee", "Bakery"]));
		const parsed = parseCategoryNote(parseProps(note), note);
		expect(names(parsed)).toEqual(["Bakery", "coffee", "Restaurants", "Food - Misc"]);
		expect(note.indexOf("| Food - Misc |")).toBeLessThan(note.indexOf("| Restaurants |"));
	});
});

describe("buildCategoryNote / parseCategoryNote", () => {
	it("round trips a category", () => {
		const note = buildCategoryNote(food);
		expect(parseCategoryNote(parseProps(note), note)).toEqual({ ok: true, category: food, tableIssues: [] });
	});

	it("round trips a category that holds several types", () => {
		const mixed = category("Home", "expense", ["Rent", ["Rental income", "income"], ["Move", "transfer"]]);
		const note = buildCategoryNote(mixed);
		const parsed = parseCategoryNote(parseProps(note), note);
		expect(parsed.ok && parsed.category.subcategories.map((s) => [s.name, s.type]).sort()).toEqual([
			["Move", "transfer"], ["Rent", "expense"], ["Rental income", "income"],
		]);
	});

	it("writes a Type column and no category type property", () => {
		expect(buildCategoryNote(food)).toBe(
			"---\ntags: [nestegg/category]\nstate: current\nname: Food\n---\n\n" +
				"| Subcategory | Type |\n|---|---|\n| Groceries | expense |\n| Restaurants | expense |\n| Food - Misc | expense |\n",
		);
	});

	it("escapes pipes in subcategory names and reads them back", () => {
		const note = buildCategoryNote(category("Food", "expense", ["A|B"]));
		expect(names(parseCategoryNote(parseProps(note), note))).toEqual(["A|B"]);
	});

	it("reads a note with prose and padded cells", () => {
		const note = "---\nname: Food\n---\nIntro text\n\n|  Subcategory  |  Type  |\n| ------------- | ---- |\n|  Groceries  |  expense  |\n\nMore text\n";
		expect(parseCategoryNote(parseProps(note), note)).toMatchObject({ ok: true, category: { subcategories: [{ name: "Groceries", type: "expense" }] } });
	});

	it("skips blank rows and reports malformed ones", () => {
		const note = "---\nname: Food\n---\n| Subcategory | Type |\n|---|---|\n| A | expense |\n|  |  |\n| B | expense | extra |\n";
		const parsed = parseCategoryNote(parseProps(note), note);
		expect(names(parsed)).toEqual(["A"]);
		expect(parsed.ok && parsed.tableIssues).toHaveLength(1);
	});

	it("reports a row with an unknown or missing type, on its own line, and leaves it out", () => {
		const note = "---\nname: Food\n---\n\n| Subcategory | Type |\n|---|---|\n| A | expense |\n| B | spending |\n| C |  |\n";
		const parsed = parseCategoryNote(parseProps(note), note);
		expect(names(parsed)).toEqual(["A"]);
		expect(parsed.ok && parsed.tableIssues.map((i) => [i.line, i.text])).toEqual([[8, "| B | spending |"], [9, "| C |  |"]]);
	});

	it("has no subcategories when the note has no table", () => {
		const note = "---\nname: Food\n---\n";
		expect(parseCategoryNote(parseProps(note), note)).toMatchObject({ ok: true, category: { subcategories: [] } });
	});

	it("rejects a missing name and ignores a leftover category type property", () => {
		expect(parseCategoryNote({ categoryType: "expense" }, "")).toMatchObject({ ok: false });
		expect(parseCategoryNote({ name: "x", categoryType: "other" }, "")).toMatchObject({ ok: true });
	});
});

describe("note edits", () => {
	const note = buildCategoryNote(food);

	it("adds a subcategory row with its type", () => {
		expect(addSubcategory(note, "Coffee", "expense")).toBe(note + "| Coffee | expense |\n");
		expect(addSubcategory(note, "Refund", "income")).toBe(note + "| Refund | income |\n");
	});

	it("creates the table when the note has none", () => {
		const bare = "---\nname: Food\n---";
		const next = addSubcategory(bare, "Coffee", "expense");
		expect(parseCategoryNote(parseProps(next), next)).toMatchObject({ category: { subcategories: [{ name: "Coffee", type: "expense" }] } });
		expect(addSubcategory("", "A", "transfer")).toBe("\n| Subcategory | Type |\n|---|---|\n| A | transfer |\n");
	});

	it("renames one row without touching the others", () => {
		const next = renameSubcategoryRow(note, "Groceries", "Supermarket");
		expect(next).toBe(note.replace("| Groceries |", "| Supermarket |"));
		expect(renameSubcategoryRow(note, "Nope", "X")).toBe(note);
	});

	it("changes the type of one row only", () => {
		expect(setSubcategoryTypeRow(note, "Groceries", "income")).toBe(note.replace("| Groceries | expense |", "| Groceries | income |"));
		expect(setSubcategoryTypeRow(note, "Groceries", "expense")).toBe(note);
		expect(setSubcategoryTypeRow(note, "Nope", "income")).toBe(note);
		expect(setSubcategoryTypeRow("no table", "x", "income")).toBe("no table");
	});

	it("removes one row", () => {
		expect(removeSubcategoryRow(note, "Restaurants")).toBe(note.replace("| Restaurants | expense |\n", ""));
		expect(removeSubcategoryRow(note, "Nope")).toBe(note);
		expect(removeSubcategoryRow("no table", "x")).toBe("no table");
	});

	it("refuses to rewrite a table with unreadable rows", () => {
		const broken = note + "| a |\n";
		expect(() => addSubcategory(broken, "X", "expense")).toThrow(/unreadable/);
	});
});
