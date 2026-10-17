import { ASSET_TYPES, sortValuations, valuationProblem, type Asset, type AssetType, type Valuation } from "../domain/assets";
import { DEFAULT_ACCOUNT_COLOR, isHexColor } from "../domain/colors";
import { isIsoDate } from "../domain/dates";
import { formatRow } from "../table/cells";
import { addRow, removeRow, replaceRow } from "../table/edit";
import { parseTable } from "../table/parse";
import { serializeTable } from "../table/serialize";
import type { ParsedTable } from "../table/types";
import { bool, buildNote, str, type Props, type RawProps } from "./frontmatter";
import { NOTE_TAGS } from "./kinds";
import type { RowIssue } from "./monthNote";

export const VALUATION_COLUMNS = ["Date", "ValueCents", "Note"] as const;
const FIRST_COLUMN = VALUATION_COLUMNS[0];
const INTEGER_RE = /^-?\d+$/;

export class AssetEditError extends Error {}

export type ParsedAsset = { ok: true; asset: Asset } | { ok: false; reason: string };

export function parseAssetProps(props: RawProps): ParsedAsset {
	const name = str(props, "name")?.trim();
	if (!name) return { ok: false, reason: "missing name" };

	const assetType = str(props, "assetType");
	if (!assetType || !ASSET_TYPES.includes(assetType as AssetType)) {
		return { ok: false, reason: `assetType must be one of ${ASSET_TYPES.join(", ")}` };
	}
	const color = str(props, "color");
	return {
		ok: true,
		asset: {
			name,
			assetType: assetType as AssetType,
			active: bool(props, "active") ?? true,
			color: color && isHexColor(color) ? color.toLowerCase() : DEFAULT_ACCOUNT_COLOR,
		},
	};
}

export function assetProps(asset: Asset, extra: Props = {}): Props {
	return {
		tags: [NOTE_TAGS.asset],
		state: "current",
		name: asset.name,
		assetType: asset.assetType,
		active: asset.active,
		color: asset.color,
		...extra,
	};
}

export function parseValuationRow(cells: string[]): Valuation | string {
	if (cells.length !== VALUATION_COLUMNS.length) return `expected ${VALUATION_COLUMNS.length} cells, found ${cells.length}`;
	const [date, value, note] = cells;
	if (!isIsoDate(date)) return `invalid date "${date}"`;
	if (!INTEGER_RE.test(value) || !Number.isSafeInteger(Number(value))) return `ValueCents must be an integer, found "${value}"`;
	if (Number(value) < 0) return "ValueCents cannot be negative";
	return { date, valueCents: Number(value), note };
}

const oneLine = (text: string) => text.replace(/\s*\r?\n\s*/g, " ");
const cellsOf = (v: Valuation) => [v.date, String(v.valueCents), oneLine(v.note)];

// The line number of the first data row: the header is the line after `before`, then the separator.
const firstRowLine = (table: ParsedTable) => table.before.split("\n").length + 2;

// Rows come back sorted by date whatever order the file keeps them in; a second row for a date
// is reported and skipped.
export function readValuations(content: string): { valuations: Valuation[]; issues: RowIssue[] } {
	const table = parseTable(content, FIRST_COLUMN);
	const valuations: Valuation[] = [];
	const issues: RowIssue[] = [];
	if (!table) return { valuations, issues };
	const first = firstRowLine(table);
	const seen = new Set<string>();
	table.rows.forEach((row, i) => {
		const reject = (reason: string) => issues.push({ line: first + i, reason, text: row.raw ?? row.cells.join(" | ") });
		const parsed = parseValuationRow(row.cells);
		if (typeof parsed === "string") return void reject(parsed);
		if (seen.has(parsed.date)) return void reject(`duplicate date "${parsed.date}"`);
		seen.add(parsed.date);
		valuations.push(parsed);
	});
	return { valuations: sortValuations(valuations), issues };
}

// The note body: a blank line, then the table, sorted by date.
export function valuationBody(valuations: Valuation[]): string {
	const header = [`| ${VALUATION_COLUMNS.join(" | ")} |`, `|${VALUATION_COLUMNS.map(() => "---").join("|")}|`];
	const rows = sortValuations(valuations).map((v) => formatRow(cellsOf(v)));
	return `\n${[...header, ...rows].join("\n")}\n`;
}

export function buildAssetNote(asset: Asset, valuations: Valuation[]): string {
	return buildNote(assetProps(asset), valuationBody(valuations));
}

function checkValuation(valuation: Valuation): void {
	const problem = valuationProblem(valuation);
	if (problem === "invalidDate") throw new AssetEditError("The valuation date is not a valid date");
	if (problem === "invalidValue") throw new AssetEditError("A value must be a whole number of cents, zero or more");
}

// Edits go through the table only and refuse one with unreadable rows rather than guess.
function editableTable(content: string): ParsedTable | null {
	const table = parseTable(content, FIRST_COLUMN);
	if (!table) return null;
	const { issues } = readValuations(content);
	if (issues.length > 0 || table.issues.length > 0) {
		throw new AssetEditError(`Refusing to edit valuations with unreadable rows (line ${issues[0]?.line ?? table.issues[0].line})`);
	}
	return table;
}

// Drops the row dated `date`; a date with no row is refused rather than ignored.
export function removeValuationRow(content: string, date: string): string {
	const table = editableTable(content);
	const at = table ? table.rows.findIndex((row) => row.cells[0] === date) : -1;
	if (!table || at < 0) throw new AssetEditError(`There is no entry dated ${date}`);
	removeRow(table, at);
	return serializeTable(table);
}

// A row for the date is replaced, otherwise the row is added; the table stays sorted by date.
export function upsertValuationRow(content: string, valuation: Valuation): string {
	checkValuation(valuation);
	const table = editableTable(content);
	if (!table) {
		const head = [`| ${VALUATION_COLUMNS.join(" | ")} |`, `|${VALUATION_COLUMNS.map(() => "---").join("|")}|`, formatRow(cellsOf(valuation))];
		return `${content.replace(/\n*$/, "\n")}\n${head.join("\n")}\n`;
	}
	const at = table.rows.findIndex((row) => row.cells[0] === valuation.date);
	if (at >= 0) replaceRow(table, at, cellsOf(valuation));
	else addRow(table, cellsOf(valuation));
	table.rows.sort((a, b) => (a.cells[0] < b.cells[0] ? -1 : a.cells[0] > b.cells[0] ? 1 : 0));
	return serializeTable(table);
}
