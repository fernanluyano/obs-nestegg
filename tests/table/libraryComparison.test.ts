import { formatTable, optionsWithDefaults, readTable } from "@tgrosinger/md-advanced-tables";
import { describe, expect, it } from "vitest";
import { parseTable } from "../../table/parse";
import { serializeTable } from "../../table/serialize";

// Records why the own parser was chosen over @tgrosinger/md-advanced-tables (see the file-structure
// ticket's POC). The library is a devDependency used only by this spec.
const options = optionsWithDefaults({});
const libraryFormat = (lines: string[]) =>
	formatTable(readTable(lines, options), options)
		.table.getRows()
		.map((r) => r.toText());

describe("md-advanced-tables vs the own parser", () => {
	const messy = ["| Subcategory |", "|---|", "| Groceries |", "|  Restaurants  |"];

	it("library reformats every row and the separator; ours keeps untouched rows byte for byte", () => {
		expect(libraryFormat(messy)).not.toEqual(messy);
		const content = messy.join("\n") + "\n";
		expect(serializeTable(parseTable(content, "Subcategory")!)).toBe(content);
	});

	it("library takes lines only, so the caller still has to find the table in the note", () => {
		expect(() => readTable(["Some prose", "| Subcategory |"], options)).not.toThrow();
	});

	it("library leaves a pipe in a name escaped; ours returns the real name", () => {
		const line = "| Food \\| Drink |";
		const [, , cell] = readTable(["| Subcategory |", "|---|", line], options).getRows();
		expect(cell.getCells()[0].content).toBe("Food \\| Drink");
		expect(parseTable(`| Subcategory |\n|---|\n${line}\n`, "Subcategory")!.rows[0].cells[0]).toBe("Food | Drink");
	});

	it("library accepts a row with the wrong cell count silently; ours reports it", () => {
		const lines = ["| Subcategory |", "|---|", "| A | extra |"];
		expect(() => libraryFormat(lines)).not.toThrow();
		expect(parseTable(lines.join("\n"), "Subcategory")!.issues).toHaveLength(1);
	});
});
