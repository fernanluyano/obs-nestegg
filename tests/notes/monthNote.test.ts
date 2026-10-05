import { describe, expect, it } from "vitest";
import { buildCategoryIndex } from "../../domain/categories";
import { defaultCategories } from "../../domain/defaults";
import type { Transaction } from "../../domain/types";
import { parseProps } from "../../notes/frontmatter";
import {
	buildMonthNote, editMonthNote, MONTH_COLUMNS, MonthEditError, parseMonthNote, parseRowCells, refreshTotals, rowToCells,
} from "../../notes/monthNote";

const index = buildCategoryIndex(defaultCategories());
const key = { account: "Cash Main", month: "2026-10" };

const tx = (over: Partial<Transaction> = {}): Transaction => ({
	date: "2026-10-01", merchant: "Publix", subcategory: "Groceries", amountCents: -8450,
	note: "", tags: [], fromTo: "", ...over,
});

const parse = (content: string) => parseMonthNote(parseProps(content), content);

describe("parseRowCells / rowToCells", () => {
	it("round trips a row", () => {
		const row = tx({ tags: ["weekly", "gift"], note: "a note", fromTo: "Savings" });
		expect(parseRowCells(rowToCells(row))).toEqual(row);
	});

	it("flattens newlines in free text", () => {
		expect(rowToCells(tx({ note: "a\nb", merchant: "x\r\ny" }))).toEqual([
			"2026-10-01", "x y", "Groceries", "-8450", "a b", "", "",
		]);
	});

	it("reports why a row is unreadable", () => {
		expect(parseRowCells(["a"])).toMatch(/expected 7 cells/);
		expect(parseRowCells(["10/01", "", "G", "1", "", "", ""])).toMatch(/invalid date/);
		expect(parseRowCells(["2026-10-01", "", "G", "1.5", "", "", ""])).toMatch(/integer/);
		expect(parseRowCells(["2026-10-01", "", "G", "", "", "", ""])).toMatch(/integer/);
		expect(parseRowCells(["2026-10-01", "", "G", "99999999999999999999", "", "", ""])).toMatch(/integer/);
		expect(parseRowCells(["2026-10-01", "", "", "1", "", "", ""])).toMatch(/subcategory/);
	});

	it("drops empty tags and trims the rest", () => {
		const parsed = parseRowCells(["2026-10-01", "", "G", "1", "", " a ,, b ", ""]);
		expect(typeof parsed !== "string" && parsed.tags).toEqual(["a", "b"]);
	});
});

describe("buildMonthNote / parseMonthNote", () => {
	const rows = [tx(), tx({ subcategory: "Salary", amountCents: 250000, merchant: "Employer" }), tx({ amountCents: 1200 })];

	it("writes the layout from the design with totals", () => {
		const note = buildMonthNote(key, rows, index);
		expect(note.startsWith(
			"---\ntags: [nestegg/transactions]\nstate: current\naccount: Cash Main\nmonth: 2026-10\nincomeCents: 250000\nexpenseCents: 7250\n---\n\n" +
				`| ${MONTH_COLUMNS.join(" | ")} |\n|---|---|---|---|---|---|---|\n`,
		)).toBe(true);
	});

	it("parses back the same rows and stored totals", () => {
		const parsed = parse(buildMonthNote(key, rows, index));
		expect(parsed).toMatchObject({
			ok: true, account: "Cash Main", month: "2026-10",
			stored: { incomeCents: 250000, expenseCents: 7250 }, rowIssues: [],
		});
		expect(parsed.ok && parsed.transactions).toEqual(rows);
	});

	it("builds an empty month", () => {
		const parsed = parse(buildMonthNote(key, [], index));
		expect(parsed).toMatchObject({ ok: true, transactions: [], stored: { incomeCents: 0, expenseCents: 0 } });
	});

	it("reports unreadable rows with their line numbers and keeps the good ones", () => {
		const note = buildMonthNote(key, rows, index) + "| 2026-10-09 | too few |\n| nope | m | Groceries | 5 |  |  |  |\n";
		const parsed = parse(note);
		expect(parsed.ok && parsed.transactions).toHaveLength(3);
		const issues = parsed.ok ? parsed.rowIssues : [];
		expect(issues.map((i) => i.line)).toEqual([15, 16]);
		expect(issues[0].reason).toMatch(/expected 7 cells/);
		expect(issues[1].reason).toMatch(/invalid date/);
		expect(note.split("\n")[14]).toContain("too few");
	});

	it("has no rows when the note has no table", () => {
		const parsed = parse("---\naccount: A\nmonth: 2026-10\n---\nprose\n");
		expect(parsed).toMatchObject({ ok: true, transactions: [], stored: {} });
	});

	it("rejects a missing account or a bad month", () => {
		expect(parse("---\nmonth: 2026-10\n---\n")).toEqual({ ok: false, reason: "missing account" });
		expect(parse("---\naccount: A\nmonth: 2026-13\n---\n")).toMatchObject({ ok: false });
		expect(parse("---\naccount: A\n---\n")).toMatchObject({ ok: false });
	});

	it("reads a month with prose around the table", () => {
		const note = "---\naccount: A\nmonth: 2026-10\n---\nTop prose\n\n| Date | Merchant | Subcategory | AmountCents | Note | Tags | FromTo |\n| ---- | ---- | ---- | ---- | ---- | ---- | ---- |\n| 2026-10-01 | Pu\\|blix | Groceries | -5 |  | a, b |  |\n\nBottom prose\n";
		expect(parse(note)).toMatchObject({ ok: true, transactions: [{ merchant: "Pu|blix", tags: ["a", "b"] }] });
	});
});

describe("editMonthNote", () => {
	const base = buildMonthNote(key, [tx()], index);

	it("appends a row and refreshes totals, leaving the rest byte for byte", () => {
		const income = tx({ subcategory: "Salary", amountCents: 100, merchant: "Employer" });
		const next = editMonthNote(base, { kind: "add", tx: income }, index);
		expect(next).toBe(buildMonthNote(key, [tx(), income], index));
	});

	it("preserves prose and untouched rows when editing", () => {
		const note = base.replace("\n\n|", "\n\nTop prose\n\n|") + "\nBottom prose\n";
		const next = editMonthNote(note, { kind: "add", tx: tx({ amountCents: 1 }) }, index);
		expect(next).toContain("Top prose");
		expect(next).toContain("\nBottom prose\n");
		expect(next).toContain("| 2026-10-01 | Publix | Groceries | -8450 |  |  |  |");
	});

	it("removes a row", () => {
		const two = buildMonthNote(key, [tx(), tx({ note: "b" })], index);
		const next = editMonthNote(two, { kind: "remove", tx: tx({ note: "b" }) }, index);
		expect(next).toBe(base);
	});

	it("replaces a row and recomputes totals", () => {
		const next = editMonthNote(base, { kind: "replace", old: tx(), next: tx({ subcategory: "Salary", amountCents: 500 }) }, index);
		expect(parse(next)).toMatchObject({ stored: { incomeCents: 500, expenseCents: 0 } });
	});

	it("throws when the row to remove or replace is not there", () => {
		expect(() => editMonthNote(base, { kind: "remove", tx: tx({ note: "zzz" }) }, index)).toThrow(MonthEditError);
		expect(() => editMonthNote(base, { kind: "replace", old: tx({ note: "zzz" }), next: tx() }, index)).toThrow(/not found/);
	});

	it("creates the table when the month note has none", () => {
		const bare = "---\ntags: [nestegg/transactions]\naccount: Cash Main\nmonth: 2026-10\n---";
		const next = editMonthNote(bare, { kind: "add", tx: tx() }, index);
		expect(parse(next)).toMatchObject({ ok: true, transactions: [tx()], stored: { expenseCents: 8450 } });
		expect(editMonthNote("", { kind: "add", tx: tx() }, index)).toContain("| Date |");
	});

	it("refuses to remove from a note with no table", () => {
		expect(() => editMonthNote("---\naccount: A\n---\n", { kind: "remove", tx: tx() }, index)).toThrow(/no transactions table/);
	});

	it("refuses to write a table with unreadable rows", () => {
		const broken = base + "| 2026-10-09 | too few |\n";
		expect(() => editMonthNote(broken, { kind: "add", tx: tx() }, index)).toThrow(/unreadable rows \(line/);
		const badDate = base + "| nope | m | Groceries | 5 |  |  |  |\n";
		expect(() => editMonthNote(badDate, { kind: "add", tx: tx() }, index)).toThrow(MonthEditError);
	});

	it("keeps a table that ends the file without a trailing newline", () => {
		const noNewline = base.replace(/\n$/, "");
		const next = editMonthNote(noNewline, { kind: "add", tx: tx({ note: "x" }) }, index);
		expect(next.endsWith("\n")).toBe(false);
		expect(parse(next)).toMatchObject({ transactions: [tx(), tx({ note: "x" })] });
	});
});

describe("refreshTotals", () => {
	it("rewrites only the totals", () => {
		const note = buildMonthNote(key, [tx()], index).replace("expenseCents: 8450", "expenseCents: 1");
		expect(refreshTotals(note, [tx()], index)).toBe(buildMonthNote(key, [tx()], index));
	});
});
