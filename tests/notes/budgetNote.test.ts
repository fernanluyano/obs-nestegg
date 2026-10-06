import { describe, expect, it } from "vitest";
import {
	BudgetEditError, buildBudgetNote, moveBudgetLine, parseBudgetNote, parseBudgetRow, removeBudgetLines, renameBudgetSubcategory, setPlanned,
} from "../../notes/budgetNote";
import { parseProps } from "../../notes/frontmatter";

const lines = [{ subcategory: "Groceries", plannedCents: 40000 }, { subcategory: "Rent", plannedCents: 150000 }];
const parse = (content: string) => parseBudgetNote(parseProps(content), content);
const note = () => buildBudgetNote("2026-10", lines);

describe("parseBudgetRow", () => {
	it("reads a line", () => {
		expect(parseBudgetRow(["Groceries", "40000"])).toEqual({ subcategory: "Groceries", plannedCents: 40000 });
	});

	it("reports why a row is unreadable", () => {
		expect(parseBudgetRow(["a"])).toMatch(/expected 2 cells/);
		expect(parseBudgetRow(["", "1"])).toMatch(/subcategory/);
		expect(parseBudgetRow(["A", "1.5"])).toMatch(/integer/);
		expect(parseBudgetRow(["A", ""])).toMatch(/integer/);
		expect(parseBudgetRow(["A", "99999999999999999999"])).toMatch(/integer/);
		expect(parseBudgetRow(["A", "-5"])).toMatch(/negative/);
	});
});

describe("buildBudgetNote / parseBudgetNote", () => {
	it("tags the note and round trips its lines", () => {
		const text = note();
		expect(parseProps(text)).toMatchObject({ tags: ["nestegg/budget"], state: "current", month: "2026-10" });
		expect(parse(text)).toEqual({ ok: true, month: "2026-10", lines, rowIssues: [] });
	});

	it("reads a note with no table as an empty plan", () => {
		expect(parse("---\ntags: [nestegg/budget]\nmonth: 2026-10\n---\nhello\n")).toMatchObject({ ok: true, lines: [] });
	});

	it("rejects a note without a valid month", () => {
		expect(parse("---\nmonth: October\n---\n")).toEqual({ ok: false, reason: "month must be YYYY-MM" });
		expect(parse("---\ntags: [x]\n---\n")).toMatchObject({ ok: false });
	});

	it("keeps readable rows and reports bad and duplicate ones with their line", () => {
		const text = note().replace("| Rent | 150000 |", "| Rent | lots |\n| Groceries | 5 |");
		const parsed = parse(text);
		expect(parsed).toMatchObject({ ok: true, lines: [lines[0]] });
		const issues = (parsed as { rowIssues: { line: number; reason: string }[] }).rowIssues;
		expect(issues.map((i) => i.reason)).toEqual([expect.stringMatching(/integer/), expect.stringMatching(/duplicate/)]);
		expect(issues[0].line).toBe(text.split("\n").findIndex((l) => l.includes("lots")) + 1);
	});
});

describe("setPlanned", () => {
	it("changes only the one cell", () => {
		const next = setPlanned(note(), "Groceries", 45000);
		expect(next).toBe(note().replace("| Groceries | 40000 |", "| Groceries | 45000 |"));
	});

	it("returns the content untouched when the amount is already planned", () => {
		expect(setPlanned(note(), "Rent", 150000)).toBe(note());
	});

	it("adds a line for a subcategory the budget does not have yet", () => {
		const next = setPlanned(note(), "Fuel", 12000);
		expect(parse(next)).toMatchObject({ lines: [...lines, { subcategory: "Fuel", plannedCents: 12000 }] });
	});

	it("refuses amounts that are not whole non-negative cents", () => {
		expect(() => setPlanned(note(), "Rent", 1.5)).toThrow(BudgetEditError);
		expect(() => setPlanned(note(), "Rent", -1)).toThrow(/zero or more/);
	});

	it("refuses a note without a table and one with unreadable rows", () => {
		expect(() => setPlanned("---\nmonth: 2026-10\n---\n", "Rent", 1)).toThrow(/no table/);
		expect(() => setPlanned(note().replace("150000", "lots"), "Rent", 1)).toThrow(/unreadable rows \(line/);
		const stray = note().replace("| Rent | 150000 |", "| Rent | 150000 | extra |");
		expect(() => setPlanned(stray, "Rent", 1)).toThrow(BudgetEditError);
	});
});

describe("moveBudgetLine", () => {
	it("adds the plan to the target's when it has one", () => {
		const moved = moveBudgetLine(note(), "Groceries", "Rent");
		expect(parse(moved)).toMatchObject({ lines: [{ subcategory: "Rent", plannedCents: 190000 }] });
	});

	it("renames the line when the target has none yet", () => {
		expect(parse(moveBudgetLine(note(), "Groceries", "Fuel"))).toMatchObject({
			lines: [{ subcategory: "Fuel", plannedCents: 40000 }, lines[1]],
		});
	});

	it("does nothing when the budget has no line to move", () => {
		expect(moveBudgetLine(note(), "Fuel", "Rent")).toBe(note());
		expect(moveBudgetLine("no table", "Fuel", "Rent")).toBe("no table");
	});

	it("refuses a table with unreadable rows", () => {
		expect(() => moveBudgetLine(note().replace("150000", "lots"), "Groceries", "Rent")).toThrow(BudgetEditError);
	});
});

describe("renameBudgetSubcategory / removeBudgetLines", () => {
	it("renames the matching line only", () => {
		expect(parse(renameBudgetSubcategory(note(), "Groceries", "Food shop"))).toMatchObject({
			lines: [{ subcategory: "Food shop", plannedCents: 40000 }, lines[1]],
		});
	});

	it("leaves the note as it was when nothing matches", () => {
		expect(renameBudgetSubcategory(note(), "Nope", "X")).toBe(note());
		expect(removeBudgetLines(note(), ["Nope"])).toBe(note());
		expect(removeBudgetLines("no table here", ["Rent"])).toBe("no table here");
	});

	it("removes every listed line and keeps the rest", () => {
		const three = buildBudgetNote("2026-10", [...lines, { subcategory: "Fuel", plannedCents: 1 }]);
		expect(parse(removeBudgetLines(three, ["Groceries", "Fuel"]))).toMatchObject({ lines: [lines[1]] });
	});
});
