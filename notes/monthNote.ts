import { isIsoDate, isYearMonth } from "../domain/dates";
import type { CategoryIndex } from "../domain/categories";
import { findTransactionIndex, summarize } from "../domain/transactions";
import type { MonthSummary, Transaction } from "../domain/types";
import { addRow, removeRow, replaceRow } from "../table/edit";
import { formatRow } from "../table/cells";
import { parseTable } from "../table/parse";
import { serializeTable } from "../table/serialize";
import type { ParsedTable } from "../table/types";
import { buildNote, int, patchProps, str, type RawProps } from "./frontmatter";
import { NOTE_TAGS } from "./kinds";

export const MONTH_COLUMNS = ["Date", "Merchant", "Subcategory", "AmountCents", "Note", "Tags", "FromTo"] as const;
const FIRST_COLUMN = MONTH_COLUMNS[0];
const INTEGER_RE = /^-?\d+$/;

export interface RowIssue {
	line: number;
	reason: string;
	text: string;
}

export type ParsedMonth =
	| {
			ok: true;
			account: string;
			month: string;
			stored: Partial<MonthSummary>;
			transactions: Transaction[];
			rowIssues: RowIssue[];
	  }
	| { ok: false; reason: string };

export class MonthEditError extends Error {}

export function parseRowCells(cells: string[]): Transaction | string {
	if (cells.length !== MONTH_COLUMNS.length) return `expected ${MONTH_COLUMNS.length} cells, found ${cells.length}`;
	const [date, merchant, subcategory, amount, note, tags, fromTo] = cells;
	if (!isIsoDate(date)) return `invalid date "${date}"`;
	if (!INTEGER_RE.test(amount) || !Number.isSafeInteger(Number(amount))) return `AmountCents must be an integer, found "${amount}"`;
	if (subcategory === "") return "missing subcategory";
	return {
		date,
		merchant,
		subcategory,
		amountCents: Number(amount),
		note,
		tags: tags.split(",").map((t) => t.trim()).filter((t) => t !== ""),
		fromTo,
	};
}

export function rowToCells(tx: Transaction): string[] {
	const oneLine = (text: string) => text.replace(/\s*\r?\n\s*/g, " ");
	return [tx.date, oneLine(tx.merchant), tx.subcategory, String(tx.amountCents), oneLine(tx.note), tx.tags.join(","), tx.fromTo];
}

// The line number of the first data row: the header is the line after `before`, then the separator.
function firstRowLine(table: ParsedTable): number {
	return table.before.split("\n").length + 2;
}

function readRows(table: ParsedTable | null): { transactions: Transaction[]; issues: RowIssue[] } {
	const transactions: Transaction[] = [];
	const issues: RowIssue[] = [];
	if (!table) return { transactions, issues };
	const first = firstRowLine(table);
	table.rows.forEach((row, i) => {
		const parsed = parseRowCells(row.cells);
		if (typeof parsed === "string") {
			issues.push({ line: first + i, reason: parsed, text: row.raw ?? row.cells.join(" | ") });
		} else {
			transactions.push(parsed);
		}
	});
	return { transactions, issues };
}

export function parseMonthNote(props: RawProps, content: string): ParsedMonth {
	const account = str(props, "account")?.trim();
	if (!account) return { ok: false, reason: "missing account" };
	const month = str(props, "month")?.trim() ?? "";
	if (!isYearMonth(month)) return { ok: false, reason: "month must be YYYY-MM" };

	const { transactions, issues } = readRows(parseTable(content, FIRST_COLUMN));
	return {
		ok: true,
		account,
		month,
		stored: { incomeCents: int(props, "incomeCents"), expenseCents: int(props, "expenseCents") },
		transactions,
		rowIssues: issues,
	};
}

const HEADER = `| ${MONTH_COLUMNS.join(" | ")} |`;
const SEPARATOR = `|${MONTH_COLUMNS.map(() => "---").join("|")}|`;

export function buildMonthNote(
	key: { account: string; month: string },
	transactions: Transaction[],
	index: CategoryIndex,
): string {
	const { incomeCents, expenseCents } = summarize(transactions, index);
	const rows = transactions.map((tx) => formatRow(rowToCells(tx)));
	return buildNote(
		{
			tags: [NOTE_TAGS.transactions],
			state: "current",
			account: key.account,
			month: key.month,
			incomeCents,
			expenseCents,
		},
		`\n${[HEADER, SEPARATOR, ...rows].join("\n")}\n`,
	);
}

export type MonthEdit =
	| { kind: "add"; tx: Transaction }
	| { kind: "remove"; tx: Transaction }
	| { kind: "replace"; old: Transaction; next: Transaction };

// Applies one row edit to the table only and refreshes the frontmatter totals; the rest of the
// note stays byte for byte. Refuses a table with unreadable rows rather than guess.
export function editMonthNote(content: string, edit: MonthEdit, index: CategoryIndex): string {
	const table = parseTable(content, FIRST_COLUMN);
	if (!table && edit.kind !== "add") throw new MonthEditError("this month has no transactions table");

	const { transactions, issues } = readRows(table);
	if (issues.length > 0 || (table && table.issues.length > 0)) {
		throw new MonthEditError(`Refusing to edit a month with unreadable rows (line ${issues[0]?.line ?? table?.issues[0].line})`);
	}

	let next: string;
	if (!table) {
		const base = content.endsWith("\n") || content === "" ? content : content + "\n";
		const added = (edit as { tx: Transaction }).tx;
		next = `${base}\n${HEADER}\n${SEPARATOR}\n${formatRow(rowToCells(added))}\n`;
		return patchProps(next, totals([added], index));
	}

	if (edit.kind === "add") {
		addRow(table, rowToCells(edit.tx));
		transactions.push(edit.tx);
	} else {
		const target = edit.kind === "remove" ? edit.tx : edit.old;
		const at = findTransactionIndex(transactions, target);
		if (at < 0) throw new MonthEditError("transaction not found in this month");
		if (edit.kind === "remove") {
			removeRow(table, at);
			transactions.splice(at, 1);
		} else {
			replaceRow(table, at, rowToCells(edit.next));
			transactions[at] = edit.next;
		}
	}
	return patchProps(serializeTable(table), totals(transactions, index));
}

function totals(transactions: Transaction[], index: CategoryIndex) {
	const { incomeCents, expenseCents } = summarize(transactions, index);
	return { incomeCents, expenseCents };
}

// Rewrites the frontmatter totals from the rows already in the note.
export function refreshTotals(content: string, transactions: Transaction[], index: CategoryIndex): string {
	return patchProps(content, totals(transactions, index));
}
