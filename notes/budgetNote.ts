import { isYearMonth } from "../domain/dates";
import type { BudgetLine } from "../domain/types";
import { addRow, removeRow, updateCell } from "../table/edit";
import { formatRow } from "../table/cells";
import { parseTable } from "../table/parse";
import { serializeTable } from "../table/serialize";
import type { ParsedTable } from "../table/types";
import { buildNote, str, type RawProps } from "./frontmatter";
import { NOTE_TAGS } from "./kinds";
import type { RowIssue } from "./monthNote";
import { mapColumn } from "./tableColumns";

export const BUDGET_COLUMNS = ["Subcategory", "PlannedCents"] as const;
const FIRST_COLUMN = BUDGET_COLUMNS[0];
const AMOUNT_COLUMN = BUDGET_COLUMNS[1];
const INTEGER_RE = /^-?\d+$/;

export type ParsedBudget =
	| { ok: true; month: string; lines: BudgetLine[]; rowIssues: RowIssue[] }
	| { ok: false; reason: string };

export class BudgetEditError extends Error {}

export function parseBudgetRow(cells: string[]): BudgetLine | string {
	if (cells.length !== BUDGET_COLUMNS.length) return `expected ${BUDGET_COLUMNS.length} cells, found ${cells.length}`;
	const [subcategory, planned] = cells;
	if (subcategory === "") return "missing subcategory";
	if (!INTEGER_RE.test(planned) || !Number.isSafeInteger(Number(planned))) return `PlannedCents must be an integer, found "${planned}"`;
	if (Number(planned) < 0) return "PlannedCents cannot be negative";
	return { subcategory, plannedCents: Number(planned) };
}

// The line number of the first data row: the header is the line after `before`, then the separator.
function firstRowLine(table: ParsedTable): number {
	return table.before.split("\n").length + 2;
}

function readLines(table: ParsedTable | null): { lines: BudgetLine[]; issues: RowIssue[] } {
	const lines: BudgetLine[] = [];
	const issues: RowIssue[] = [];
	if (!table) return { lines, issues };
	const first = firstRowLine(table);
	const seen = new Set<string>();
	table.rows.forEach((row, i) => {
		const reject = (reason: string) => issues.push({ line: first + i, reason, text: row.raw ?? row.cells.join(" | ") });
		const parsed = parseBudgetRow(row.cells);
		if (typeof parsed === "string") return void reject(parsed);
		if (seen.has(parsed.subcategory)) return void reject(`duplicate line for "${parsed.subcategory}"`);
		seen.add(parsed.subcategory);
		lines.push(parsed);
	});
	return { lines, issues };
}

export function parseBudgetNote(props: RawProps, content: string): ParsedBudget {
	const month = str(props, "month")?.trim() ?? "";
	if (!isYearMonth(month)) return { ok: false, reason: "month must be YYYY-MM" };
	const { lines, issues } = readLines(parseTable(content, FIRST_COLUMN));
	return { ok: true, month, lines, rowIssues: issues };
}

const budgetRow = (line: BudgetLine) => formatRow([line.subcategory, String(line.plannedCents)]);

export function buildBudgetNote(month: string, lines: BudgetLine[]): string {
	const table = [`| ${BUDGET_COLUMNS.join(" | ")} |`, `|${BUDGET_COLUMNS.map(() => "---").join("|")}|`, ...lines.map(budgetRow)];
	return buildNote({ tags: [NOTE_TAGS.budget], state: "current", month }, `\n${table.join("\n")}\n`);
}

// Edits go through the table only and refuse a table with unreadable rows rather than guess.
function editableTable(content: string): ParsedTable {
	const table = parseTable(content, FIRST_COLUMN);
	if (!table) throw new BudgetEditError("this budget has no table");
	const { issues } = readLines(table);
	if (issues.length > 0 || table.issues.length > 0) {
		throw new BudgetEditError(`Refusing to edit a budget with unreadable rows (line ${issues[0]?.line ?? table.issues[0].line})`);
	}
	return table;
}

// Changes one subcategory's planned amount, adding its line when the budget has none yet.
export function setPlanned(content: string, subcategory: string, plannedCents: number): string {
	if (!Number.isSafeInteger(plannedCents) || plannedCents < 0) throw new BudgetEditError("A planned amount must be a whole number of cents, zero or more");
	const table = editableTable(content);
	const at = table.rows.findIndex((row) => row.cells[0] === subcategory);
	if (at < 0) addRow(table, [subcategory, String(plannedCents)]);
	else if (table.rows[at].cells[1] === String(plannedCents)) return content;
	else updateCell(table, at, table.header.indexOf(AMOUNT_COLUMN), String(plannedCents));
	return serializeTable(table);
}

export function renameBudgetSubcategory(content: string, from: string, to: string): string {
	return mapColumn(content, FIRST_COLUMN, FIRST_COLUMN, (v) => (v === from ? to : v));
}

// Folds a subcategory's plan into another's when its transactions move there, so the target's
// plan still covers what it now holds. Does nothing if the budget has no line for `from`.
export function moveBudgetLine(content: string, from: string, to: string): string {
	if (!parseTable(content, FIRST_COLUMN)?.rows.some((row) => row.cells[0] === from)) return content;
	const table = editableTable(content);
	const fromAt = table.rows.findIndex((row) => row.cells[0] === from);
	const toAt = table.rows.findIndex((row) => row.cells[0] === to);
	if (toAt < 0) {
		updateCell(table, fromAt, 0, to);
	} else {
		const sum = Number(table.rows[fromAt].cells[1]) + Number(table.rows[toAt].cells[1]);
		updateCell(table, toAt, 1, String(sum));
		removeRow(table, fromAt);
	}
	return serializeTable(table);
}

export function removeBudgetLines(content: string, subcategories: string[]): string {
	const table = parseTable(content, FIRST_COLUMN);
	if (!table) return content;
	const doomed = new Set(subcategories);
	const hits = table.rows.flatMap((row, i) => (doomed.has(row.cells[0]) ? [i] : []));
	if (hits.length === 0) return content;
	for (const i of hits.reverse()) removeRow(table, i);
	return serializeTable(table);
}
