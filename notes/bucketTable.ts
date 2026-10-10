import type { Bucket } from "../domain/buckets";
import { formatRow } from "../table/cells";
import { addRow, removeRow, replaceRow } from "../table/edit";
import { parseTable } from "../table/parse";
import { serializeTable } from "../table/serialize";
import type { ParsedTable } from "../table/types";
import type { RowIssue } from "./monthNote";

export const BUCKET_COLUMNS = ["Bucket", "GoalCents", "BalanceCents"] as const;
const FIRST_COLUMN = BUCKET_COLUMNS[0];
const INTEGER_RE = /^-?\d+$/;

export class BucketEditError extends Error {}

export function parseBucketRow(cells: string[]): Bucket | string {
	if (cells.length !== BUCKET_COLUMNS.length) return `expected ${BUCKET_COLUMNS.length} cells, found ${cells.length}`;
	const [name, goal, balance] = cells;
	if (name === "") return "missing bucket name";
	if (!INTEGER_RE.test(balance) || !Number.isSafeInteger(Number(balance))) return `BalanceCents must be an integer, found "${balance}"`;
	if (Number(balance) < 0) return "BalanceCents cannot be negative";
	if (goal === "") return { name, balanceCents: Number(balance) };
	if (!INTEGER_RE.test(goal) || !Number.isSafeInteger(Number(goal))) return `GoalCents must be an integer or empty, found "${goal}"`;
	if (Number(goal) < 1) return "GoalCents must be more than zero";
	return { name, goalCents: Number(goal), balanceCents: Number(balance) };
}

// The line number of the first data row: the header is the line after `before`, then the separator.
const firstRowLine = (table: ParsedTable) => table.before.split("\n").length + 2;

export function readBuckets(content: string): { buckets: Bucket[]; issues: RowIssue[] } {
	const table = parseTable(content, FIRST_COLUMN);
	const buckets: Bucket[] = [];
	const issues: RowIssue[] = [];
	if (!table) return { buckets, issues };
	const first = firstRowLine(table);
	const seen = new Set<string>();
	table.rows.forEach((row, i) => {
		const reject = (reason: string) => issues.push({ line: first + i, reason, text: row.raw ?? row.cells.join(" | ") });
		const parsed = parseBucketRow(row.cells);
		if (typeof parsed === "string") return void reject(parsed);
		if (seen.has(parsed.name)) return void reject(`duplicate bucket "${parsed.name}"`);
		seen.add(parsed.name);
		buckets.push(parsed);
	});
	return { buckets, issues };
}

const cellsOf = (bucket: Bucket) => [bucket.name, bucket.goalCents === undefined ? "" : String(bucket.goalCents), String(bucket.balanceCents)];

function checkBucket(bucket: Bucket): void {
	if (!Number.isSafeInteger(bucket.balanceCents) || bucket.balanceCents < 0) throw new BucketEditError("A bucket balance must be a whole number of cents, zero or more");
	if (bucket.goalCents !== undefined && (!Number.isSafeInteger(bucket.goalCents) || bucket.goalCents < 1)) throw new BucketEditError("A goal must be a whole number of cents above zero");
}

// Edits go through the table only and refuse one with unreadable rows rather than guess.
function editableTable(content: string): ParsedTable | null {
	const table = parseTable(content, FIRST_COLUMN);
	if (!table) return null;
	const { issues } = readBuckets(content);
	if (issues.length > 0 || table.issues.length > 0) {
		throw new BucketEditError(`Refusing to edit buckets with unreadable rows (line ${issues[0]?.line ?? table.issues[0].line})`);
	}
	return table;
}

const indexOf = (table: ParsedTable, name: string) => table.rows.findIndex((row) => row.cells[0] === name);

// The note body is empty until the first bucket, so the table is started after the properties.
export function addBucketRow(content: string, bucket: Bucket): string {
	checkBucket(bucket);
	const table = editableTable(content);
	if (!table) {
		const head = [`| ${BUCKET_COLUMNS.join(" | ")} |`, `|${BUCKET_COLUMNS.map(() => "---").join("|")}|`, formatRow(cellsOf(bucket))];
		return `${content.replace(/\n*$/, "\n")}\n${head.join("\n")}\n`;
	}
	if (indexOf(table, bucket.name) >= 0) throw new BucketEditError(`A bucket named "${bucket.name}" already exists`);
	addRow(table, cellsOf(bucket));
	return serializeTable(table);
}

// Replaces the row named `name`, which also renames it when `next.name` differs.
export function replaceBucketRow(content: string, name: string, next: Bucket): string {
	checkBucket(next);
	const table = editableTable(content);
	const at = table ? indexOf(table, name) : -1;
	if (!table || at < 0) throw new BucketEditError(`No bucket named "${name}"`);
	if (next.name !== name && indexOf(table, next.name) >= 0) throw new BucketEditError(`A bucket named "${next.name}" already exists`);
	replaceRow(table, at, cellsOf(next));
	return serializeTable(table);
}

export function removeBucketRow(content: string, name: string): string {
	const table = editableTable(content);
	const at = table ? indexOf(table, name) : -1;
	if (!table || at < 0) throw new BucketEditError(`No bucket named "${name}"`);
	removeRow(table, at);
	return serializeTable(table);
}

// Drops every bucket, leaving the header so the note keeps its shape.
export function clearBuckets(content: string): string {
	const table = editableTable(content);
	if (!table || table.rows.length === 0) return content;
	table.rows = [];
	return serializeTable(table);
}
