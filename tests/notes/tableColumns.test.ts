import { describe, expect, it } from "vitest";
import { mapColumn } from "../../notes/tableColumns";

const note = "---\nname: x\n---\nprose\n\n| Date | FromTo |\n|---|---|\n| 2026-10-01 |  Savings |\n| 2026-10-02 | Cash |\n\nafter\n";

describe("mapColumn", () => {
	it("rewrites only the rows whose cell changes", () => {
		const next = mapColumn(note, "Date", "FromTo", (v) => (v === "Savings" ? "Nest" : v));
		expect(next).toBe(note.replace("|  Savings |", "| Nest |"));
	});

	it("returns the same text when nothing changes", () => {
		expect(mapColumn(note, "Date", "FromTo", (v) => v)).toBe(note);
	});

	it("returns the text unchanged when the table or column is missing", () => {
		expect(mapColumn("no table", "Date", "FromTo", () => "x")).toBe("no table");
		expect(mapColumn(note, "Date", "Nope", () => "x")).toBe(note);
	});

	it("refuses a table with unreadable rows", () => {
		expect(() => mapColumn(note.replace("| Cash |", "| Cash | extra |"), "Date", "FromTo", () => "x")).toThrow(/unreadable/);
	});
});
