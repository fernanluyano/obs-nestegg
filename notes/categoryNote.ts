import { sortSubcategories } from "../domain/categories";
import type { Category, Subcategory, TransactionType } from "../domain/types";
import { TRANSACTION_TYPES } from "../domain/types";
import { addRow, removeRow, updateCell } from "../table/edit";
import { formatRow } from "../table/cells";
import { parseTable } from "../table/parse";
import { serializeTable } from "../table/serialize";
import type { TableIssue } from "../table/types";
import { buildNote, str, type RawProps } from "./frontmatter";
import { NOTE_TAGS } from "./kinds";
import { mapColumn } from "./tableColumns";

export const SUBCATEGORY_COLUMN = "Subcategory";
export const TYPE_COLUMN = "Type";

export type ParsedCategory =
	| { ok: true; category: Category; tableIssues: TableIssue[] }
	| { ok: false; reason: string };

const isType = (value: string): value is TransactionType => TRANSACTION_TYPES.includes(value as TransactionType);

export function parseCategoryNote(props: RawProps, content: string): ParsedCategory {
	const name = str(props, "name")?.trim();
	if (!name) return { ok: false, reason: "missing name" };

	const table = parseTable(content, SUBCATEGORY_COLUMN);
	const issues = [...(table?.issues ?? [])];
	const subcategories: Subcategory[] = [];
	// The first data row sits after the lines before the table, its header and its separator.
	const firstRowLine = table ? table.before.split("\n").length - 1 + 3 : 0;
	table?.rows.forEach((row, i) => {
		if (row.cells.length !== 2 || row.cells[0] === "") return;
		const [subName, type] = row.cells;
		if (isType(type)) subcategories.push({ name: subName, type });
		else issues.push({ line: firstRowLine + i, reason: `type must be one of ${TRANSACTION_TYPES.join(", ")}`, text: row.raw ?? "" });
	});
	return { ok: true, category: { name, subcategories: sortSubcategories(name, subcategories) }, tableIssues: issues };
}

export function buildCategoryNote(category: Category): string {
	const rows = category.subcategories.map((s) => formatRow([s.name, s.type]));
	const table = [`| ${SUBCATEGORY_COLUMN} | ${TYPE_COLUMN} |`, "|---|---|", ...rows].join("\n");
	return buildNote({ tags: [NOTE_TAGS.category], state: "current", name: category.name }, `\n${table}\n`);
}

export function addSubcategory(content: string, subcategory: string, type: TransactionType): string {
	const table = parseTable(content, SUBCATEGORY_COLUMN);
	if (!table) {
		const base = content.endsWith("\n") || content === "" ? content : content + "\n";
		return `${base}\n| ${SUBCATEGORY_COLUMN} | ${TYPE_COLUMN} |\n|---|---|\n${formatRow([subcategory, type])}\n`;
	}
	addRow(table, [subcategory, type]);
	return serializeTable(table);
}

export function renameSubcategoryRow(content: string, from: string, to: string): string {
	return mapColumn(content, SUBCATEGORY_COLUMN, SUBCATEGORY_COLUMN, (v) => (v === from ? to : v));
}

export function setSubcategoryTypeRow(content: string, subcategory: string, type: TransactionType): string {
	const table = parseTable(content, SUBCATEGORY_COLUMN);
	if (!table) return content;
	const at = table.rows.findIndex((row) => row.cells[0] === subcategory);
	const column = table.header.indexOf(TYPE_COLUMN);
	if (at < 0 || column < 0 || table.rows[at].cells[column] === type) return content;
	updateCell(table, at, column, type);
	return serializeTable(table);
}

export function removeSubcategoryRow(content: string, subcategory: string): string {
	const table = parseTable(content, SUBCATEGORY_COLUMN);
	if (!table) return content;
	const at = table.rows.findIndex((row) => row.cells[0] === subcategory);
	if (at < 0) return content;
	removeRow(table, at);
	return serializeTable(table);
}
