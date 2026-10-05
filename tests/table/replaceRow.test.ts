import { describe, expect, it } from "vitest";
import { replaceRow } from "../../table/edit";
import { parseTable } from "../../table/parse";
import { serializeTable } from "../../table/serialize";

const note = "| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n";

describe("replaceRow", () => {
	it("rewrites only the replaced row", () => {
		const table = parseTable(note, "A")!;
		replaceRow(table, 1, ["x", "y"]);
		expect(serializeTable(table)).toBe("| A | B |\n|---|---|\n| 1 | 2 |\n| x | y |\n");
	});

	it("rejects a row with the wrong number of cells", () => {
		const table = parseTable(note, "A")!;
		expect(() => replaceRow(table, 0, ["only"])).toThrow(/1 cells, table has 2/);
	});
});
