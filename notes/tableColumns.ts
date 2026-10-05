import { updateCell } from "../table/edit";
import { parseTable } from "../table/parse";
import { serializeTable } from "../table/serialize";

// Rewrites one column's cells through `fn`, touching only the rows whose value changes so
// every other row, the header and the text around the table stay byte for byte.
export function mapColumn(
	content: string,
	firstHeaderCell: string,
	column: string,
	fn: (value: string) => string,
): string {
	const table = parseTable(content, firstHeaderCell);
	if (!table) return content;
	const col = table.header.indexOf(column);
	if (col < 0) return content;

	let changed = false;
	table.rows.forEach((row, i) => {
		const next = fn(row.cells[col]);
		if (next === row.cells[col]) return;
		updateCell(table, i, col, next);
		changed = true;
	});
	return changed ? serializeTable(table) : content;
}
