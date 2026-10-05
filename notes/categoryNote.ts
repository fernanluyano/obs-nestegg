import type { Category, TransactionType } from "../domain/types";
import { TRANSACTION_TYPES } from "../domain/types";
import { addRow, removeRow } from "../table/edit";
import { formatRow } from "../table/cells";
import { parseTable } from "../table/parse";
import { serializeTable } from "../table/serialize";
import type { TableIssue } from "../table/types";
import { buildNote, str, type RawProps } from "./frontmatter";
import { NOTE_TAGS } from "./kinds";
import { mapColumn } from "./tableColumns";

export const SUBCATEGORY_COLUMN = "Subcategory";

export type ParsedCategory =
	| { ok: true; category: Category; tableIssues: TableIssue[] }
	| { ok: false; reason: string };

export function parseCategoryNote(props: RawProps, content: string): ParsedCategory {
	const name = str(props, "name")?.trim();
	if (!name) return { ok: false, reason: "missing name" };

	const categoryType = str(props, "categoryType");
	if (!categoryType || !TRANSACTION_TYPES.includes(categoryType as TransactionType)) {
		return { ok: false, reason: `categoryType must be one of ${TRANSACTION_TYPES.join(", ")}` };
	}

	const table = parseTable(content, SUBCATEGORY_COLUMN);
	const subcategories = (table?.rows ?? [])
		.filter((row) => row.cells.length === 1)
		.map((row) => row.cells[0])
		.filter((cell) => cell !== "");
	return {
		ok: true,
		category: { name, categoryType: categoryType as TransactionType, subcategories },
		tableIssues: table?.issues ?? [],
	};
}

export function buildCategoryNote(category: Category): string {
	const rows = category.subcategories.map((s) => formatRow([s]));
	const table = [`| ${SUBCATEGORY_COLUMN} |`, "|---|", ...rows].join("\n");
	return buildNote(
		{ tags: [NOTE_TAGS.category], state: "current", name: category.name, categoryType: category.categoryType },
		`\n${table}\n`,
	);
}

export function addSubcategory(content: string, subcategory: string): string {
	const table = parseTable(content, SUBCATEGORY_COLUMN);
	if (!table) {
		const base = content.endsWith("\n") || content === "" ? content : content + "\n";
		return `${base}\n| ${SUBCATEGORY_COLUMN} |\n|---|\n${formatRow([subcategory])}\n`;
	}
	addRow(table, [subcategory]);
	return serializeTable(table);
}

export function renameSubcategoryRow(content: string, from: string, to: string): string {
	return mapColumn(content, SUBCATEGORY_COLUMN, SUBCATEGORY_COLUMN, (v) => (v === from ? to : v));
}

export function removeSubcategoryRow(content: string, subcategory: string): string {
	const table = parseTable(content, SUBCATEGORY_COLUMN);
	if (!table) return content;
	const at = table.rows.findIndex((row) => row.cells[0] === subcategory);
	if (at < 0) return content;
	removeRow(table, at);
	return serializeTable(table);
}
