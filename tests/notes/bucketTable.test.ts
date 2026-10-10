import { describe, expect, it } from "vitest";
import {
	addBucketRow, BucketEditError, clearBuckets, parseBucketRow, readBuckets, removeBucketRow, replaceBucketRow,
} from "../../notes/bucketTable";
import { buildAccountNote } from "../../notes/accountNote";
import { account } from "../helpers/fixtures";

const empty = buildAccountNote(account());
const withTable = [
	"---", "name: Cash Main", "---", "",
	"| Bucket | GoalCents | BalanceCents |", "|---|---|---|",
	"| Emergency Fund | 1000000 | 250000 |", "| Vacation |  | 40000 |", "",
].join("\n");

describe("parseBucketRow", () => {
	it("reads a row with and without a goal", () => {
		expect(parseBucketRow(["Emergency Fund", "1000000", "250000"])).toEqual({ name: "Emergency Fund", goalCents: 1000000, balanceCents: 250000 });
		expect(parseBucketRow(["Vacation", "", "40000"])).toEqual({ name: "Vacation", balanceCents: 40000 });
	});

	it("explains what is wrong with a bad row", () => {
		expect(parseBucketRow(["A", "1"])).toMatch(/expected 3 cells/);
		expect(parseBucketRow(["", "", "1"])).toMatch(/missing bucket name/);
		expect(parseBucketRow(["A", "", "1.5"])).toMatch(/BalanceCents must be an integer/);
		expect(parseBucketRow(["A", "", "-1"])).toMatch(/cannot be negative/);
		expect(parseBucketRow(["A", "x", "1"])).toMatch(/GoalCents must be an integer or empty/);
		expect(parseBucketRow(["A", "0", "1"])).toMatch(/more than zero/);
	});
});

describe("readBuckets", () => {
	it("is empty for a note with no table", () => {
		expect(readBuckets(empty)).toEqual({ buckets: [], issues: [] });
	});

	it("reads every row", () => {
		expect(readBuckets(withTable).buckets).toEqual([
			{ name: "Emergency Fund", goalCents: 1000000, balanceCents: 250000 },
			{ name: "Vacation", balanceCents: 40000 },
		]);
	});

	it("reports unreadable and duplicate rows with their line, and skips them", () => {
		const text = withTable.replace("| Vacation |  | 40000 |", "| Vacation |  | oops |\n| Emergency Fund |  | 5 |");
		const { buckets, issues } = readBuckets(text);
		expect(buckets).toHaveLength(1);
		expect(issues).toEqual([
			{ line: 8, reason: expect.stringMatching(/BalanceCents must be an integer/), text: "| Vacation |  | oops |" },
			{ line: 9, reason: 'duplicate bucket "Emergency Fund"', text: "| Emergency Fund |  | 5 |" },
		]);
	});
});

describe("addBucketRow", () => {
	it("starts the table after the properties when the body is empty", () => {
		const next = addBucketRow(empty, { name: "Vacation", balanceCents: 0 });
		expect(next.startsWith(empty.replace(/\n*$/, "\n"))).toBe(true);
		expect(next).toContain("| Bucket | GoalCents | BalanceCents |\n|---|---|---|\n| Vacation |  | 0 |\n");
		expect(readBuckets(next).buckets).toEqual([{ name: "Vacation", balanceCents: 0 }]);
	});

	it("appends to an existing table and leaves the other rows byte for byte", () => {
		const next = addBucketRow(withTable, { name: "Car", goalCents: 500, balanceCents: 0 });
		expect(next).toBe(withTable.replace("| Vacation |  | 40000 |", "| Vacation |  | 40000 |\n| Car | 500 | 0 |"));
	});

	it("refuses a duplicate name and invalid amounts", () => {
		expect(() => addBucketRow(withTable, { name: "Vacation", balanceCents: 0 })).toThrow(/already exists/);
		expect(() => addBucketRow(empty, { name: "A", balanceCents: -1 })).toThrow(BucketEditError);
		expect(() => addBucketRow(empty, { name: "A", balanceCents: 1.5 })).toThrow(BucketEditError);
		expect(() => addBucketRow(empty, { name: "A", goalCents: 0, balanceCents: 0 })).toThrow(/goal/);
	});

	it("refuses to edit a table with unreadable rows", () => {
		const broken = withTable.replace("| Vacation |  | 40000 |", "| Vacation |  | oops |");
		expect(() => addBucketRow(broken, { name: "A", balanceCents: 0 })).toThrow(/unreadable rows \(line 8\)/);
		const short = withTable.replace("| Vacation |  | 40000 |", "| Vacation | 40000 |");
		expect(() => removeBucketRow(short, "Emergency Fund")).toThrow(/unreadable rows/);
	});
});

describe("replaceBucketRow", () => {
	it("changes one row and keeps the rest as they were", () => {
		const next = replaceBucketRow(withTable, "Vacation", { name: "Vacation", goalCents: 90000, balanceCents: 50000 });
		expect(next).toBe(withTable.replace("| Vacation |  | 40000 |", "| Vacation | 90000 | 50000 |"));
	});

	it("renames a row", () => {
		const next = replaceBucketRow(withTable, "Vacation", { name: "Trip", balanceCents: 40000 });
		expect(readBuckets(next).buckets.map((b) => b.name)).toEqual(["Emergency Fund", "Trip"]);
	});

	it("refuses an unknown bucket, a taken name and a note without a table", () => {
		expect(() => replaceBucketRow(withTable, "Nope", { name: "Nope", balanceCents: 0 })).toThrow(/No bucket named "Nope"/);
		expect(() => replaceBucketRow(withTable, "Vacation", { name: "Emergency Fund", balanceCents: 0 })).toThrow(/already exists/);
		expect(() => replaceBucketRow(empty, "Vacation", { name: "Vacation", balanceCents: 0 })).toThrow(/No bucket/);
	});
});

describe("removeBucketRow and clearBuckets", () => {
	it("removes one row", () => {
		expect(readBuckets(removeBucketRow(withTable, "Vacation")).buckets.map((b) => b.name)).toEqual(["Emergency Fund"]);
	});

	it("refuses an unknown bucket", () => {
		expect(() => removeBucketRow(withTable, "Nope")).toThrow(/No bucket named/);
		expect(() => removeBucketRow(empty, "Nope")).toThrow(/No bucket named/);
	});

	it("clears every row but keeps the header, and leaves a note with nothing to clear alone", () => {
		const cleared = clearBuckets(withTable);
		expect(readBuckets(cleared).buckets).toEqual([]);
		expect(cleared).toContain("| Bucket | GoalCents | BalanceCents |");
		expect(clearBuckets(cleared)).toBe(cleared);
		expect(clearBuckets(empty)).toBe(empty);
	});
});
