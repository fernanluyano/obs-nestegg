import { describe, expect, it } from "vitest";
import {
	AssetEditError, assetProps, buildAssetNote, parseAssetProps, parseValuationRow, readValuations, upsertValuationRow,
} from "../../notes/assetNote";
import { parseProps } from "../../notes/frontmatter";
import { asset, valuation } from "../helpers/fixtures";

const note = [
	"---", "tags: [nestegg/asset]", "state: current", "name: House", "assetType: house", "active: true", 'color: "#3e63dd"', "---", "",
	"| Date | ValueCents | Note |", "|---|---|---|",
	"| 2022-09-01 | 45000000 | Purchase price |", "| 2026-06-15 | 52000000 | Zillow estimate |", "",
].join("\n");

describe("parseAssetProps", () => {
	it("reads a full note", () => {
		expect(parseAssetProps(parseProps(note))).toEqual({
			ok: true, asset: { name: "House", assetType: "house", active: true, color: "#3e63dd" },
		});
	});

	it("defaults active to true and a bad or missing color to the palette gray", () => {
		const parsed = parseAssetProps({ name: "Gold", assetType: "metal", color: "red" });
		expect(parsed).toEqual({ ok: true, asset: { name: "Gold", assetType: "metal", active: true, color: "#8b8d98" } });
		expect(parseAssetProps({ name: "Gold", assetType: "metal", active: false, color: "#ABCDEF" })).toMatchObject({
			ok: true, asset: { active: false, color: "#abcdef" },
		});
	});

	it("explains why a note is not an asset", () => {
		expect(parseAssetProps({ assetType: "house" })).toEqual({ ok: false, reason: "missing name" });
		expect(parseAssetProps({ name: "  ", assetType: "house" })).toEqual({ ok: false, reason: "missing name" });
		expect(parseAssetProps({ name: "X" })).toEqual({ ok: false, reason: expect.stringMatching(/assetType must be one of house, vehicle, metal, other/) });
		expect(parseAssetProps({ name: "X", assetType: "boat" })).toMatchObject({ ok: false });
	});
});

describe("assetProps", () => {
	it("lists the tag, the state and the asset's own properties", () => {
		expect(assetProps(asset())).toEqual({
			tags: ["nestegg/asset"], state: "current", name: "House", assetType: "house", active: true, color: "#3e63dd",
		});
	});

	it("lets the caller add or override properties", () => {
		expect(assetProps(asset(), { state: "in_transit" })).toMatchObject({ state: "in_transit" });
	});
});

describe("parseValuationRow", () => {
	it("reads a row", () => {
		expect(parseValuationRow(["2022-09-01", "45000000", "Purchase price"])).toEqual({ date: "2022-09-01", valueCents: 45000000, note: "Purchase price" });
		expect(parseValuationRow(["2022-09-01", "0", ""])).toEqual({ date: "2022-09-01", valueCents: 0, note: "" });
	});

	it("explains what is wrong with a bad row", () => {
		expect(parseValuationRow(["2022-09-01", "1"])).toMatch(/expected 3 cells, found 2/);
		expect(parseValuationRow(["2022-13-01", "1", ""])).toMatch(/invalid date/);
		expect(parseValuationRow(["2022-09-01", "1.5", ""])).toMatch(/ValueCents must be an integer/);
		expect(parseValuationRow(["2022-09-01", "", ""])).toMatch(/ValueCents must be an integer/);
		expect(parseValuationRow(["2022-09-01", "-5", ""])).toMatch(/cannot be negative/);
	});
});

describe("readValuations", () => {
	it("is empty for a note with no table", () => {
		expect(readValuations("---\nname: House\n---\n")).toEqual({ valuations: [], issues: [] });
	});

	it("reads every row", () => {
		expect(readValuations(note).valuations).toEqual([
			{ date: "2022-09-01", valueCents: 45000000, note: "Purchase price" },
			{ date: "2026-06-15", valueCents: 52000000, note: "Zillow estimate" },
		]);
	});

	it("sorts rows that sit out of order in the file", () => {
		const shuffled = note.replace("| 2022-09-01 | 45000000 | Purchase price |\n| 2026-06-15 | 52000000 | Zillow estimate |", "| 2026-06-15 | 52000000 | Zillow estimate |\n| 2022-09-01 | 45000000 | Purchase price |");
		expect(readValuations(shuffled).valuations.map((v) => v.date)).toEqual(["2022-09-01", "2026-06-15"]);
	});

	it("reports unreadable and duplicate-date rows with their line, and skips them", () => {
		const text = note.replace("| 2026-06-15 | 52000000 | Zillow estimate |", "| 2026-06-15 | oops | x |\n| 2022-09-01 | 1 | again |");
		const { valuations, issues } = readValuations(text);
		expect(valuations).toHaveLength(1);
		expect(issues).toEqual([
			{ line: 13, reason: expect.stringMatching(/ValueCents must be an integer/), text: "| 2026-06-15 | oops | x |" },
			{ line: 14, reason: 'duplicate date "2022-09-01"', text: "| 2022-09-01 | 1 | again |" },
		]);
	});
});

describe("buildAssetNote", () => {
	it("writes the properties and a history table sorted by date", () => {
		const text = buildAssetNote(asset(), [valuation({ date: "2026-06-15", note: "Zillow estimate" }), valuation({ date: "2022-09-01", valueCents: 45000000, note: "Purchase price" })]);
		expect(text).toBe(note);
		expect(parseProps(text).tags).toEqual(["nestegg/asset"]);
	});

	it("keeps a header when there are no rows, and flattens a note onto one line", () => {
		expect(readValuations(buildAssetNote(asset(), []))).toEqual({ valuations: [], issues: [] });
		expect(buildAssetNote(asset(), [])).toContain("| Date | ValueCents | Note |");
		const multi = buildAssetNote(asset(), [valuation({ note: "a\nb" })]);
		expect(readValuations(multi).valuations[0].note).toBe("a b");
	});

	it("round-trips a pipe in a note", () => {
		const text = buildAssetNote(asset(), [valuation({ note: "a | b" })]);
		expect(readValuations(text).valuations[0].note).toBe("a | b");
	});
});

describe("upsertValuationRow", () => {
	it("adds a row for a new date and keeps the table sorted", () => {
		const next = upsertValuationRow(note, valuation({ date: "2024-03-10", valueCents: 49000000, note: "Appraisal" }));
		expect(readValuations(next).valuations.map((v) => v.date)).toEqual(["2022-09-01", "2024-03-10", "2026-06-15"]);
		expect(next).toContain("| 2024-03-10 | 49000000 | Appraisal |");
	});

	it("appends a later date at the end and leaves the other rows byte for byte", () => {
		const next = upsertValuationRow(note, valuation({ date: "2026-10-01", valueCents: 53000000, note: "" }));
		expect(next).toBe(note.replace("Zillow estimate |\n", "Zillow estimate |\n| 2026-10-01 | 53000000 |  |\n"));
	});

	it("replaces the row of a date that already has one", () => {
		const next = upsertValuationRow(note, valuation({ date: "2026-06-15", valueCents: 51000000, note: "Corrected" }));
		expect(next).toBe(note.replace("| 2026-06-15 | 52000000 | Zillow estimate |", "| 2026-06-15 | 51000000 | Corrected |"));
		expect(readValuations(next).valuations).toHaveLength(2);
	});

	it("leaves the properties alone", () => {
		const next = upsertValuationRow(note, valuation({ date: "2030-01-01" }));
		expect(parseProps(next)).toEqual(parseProps(note));
	});

	it("starts the table after the properties when the note has none", () => {
		const bare = "---\nname: House\n---\n";
		const next = upsertValuationRow(bare, valuation({ date: "2026-06-15", valueCents: 5, note: "n" }));
		expect(next).toBe("---\nname: House\n---\n\n| Date | ValueCents | Note |\n|---|---|---|\n| 2026-06-15 | 5 | n |\n");
		expect(readValuations(next).valuations).toEqual([{ date: "2026-06-15", valueCents: 5, note: "n" }]);
	});

	it("refuses an invalid date or value", () => {
		expect(() => upsertValuationRow(note, valuation({ date: "nope" }))).toThrow(AssetEditError);
		expect(() => upsertValuationRow(note, valuation({ date: "nope" }))).toThrow(/valid date/);
		expect(() => upsertValuationRow(note, valuation({ valueCents: -1 }))).toThrow(/zero or more/);
		expect(() => upsertValuationRow(note, valuation({ valueCents: 1.5 }))).toThrow(AssetEditError);
	});

	it("refuses to edit a table with unreadable rows", () => {
		const broken = note.replace("| 2026-06-15 | 52000000 | Zillow estimate |", "| 2026-06-15 | oops | x |");
		expect(() => upsertValuationRow(broken, valuation())).toThrow(/unreadable rows \(line 13\)/);
		const short = note.replace("| 2026-06-15 | 52000000 | Zillow estimate |", "| 2026-06-15 | 52000000 |");
		expect(() => upsertValuationRow(short, valuation())).toThrow(/unreadable rows/);
	});
});
