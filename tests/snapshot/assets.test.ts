import { describe, expect, it } from "vitest";
import { buildAssetNote } from "../../notes/assetNote";
import { markInTransit } from "../../notes/transit";
import { assetPath } from "../../notes/paths";
import { netAsset } from "../../snapshot/queries";
import { activeAssets, assetsByType, assetsTimeline, findAsset, monthsFromFirstEntry } from "../../snapshot/assetQueries";
import { buildSnapshot, emptySnapshot } from "../../snapshot/snapshot";
import { asset, assetInput, inputOf, valuation, vaultInputs } from "../helpers/fixtures";

const house = asset();
const gold = asset({ name: "Gold", assetType: "metal", color: "#e0a526" });

const houseHistory = [
	valuation({ date: "2022-09-01", valueCents: 45000000 }),
	valuation({ date: "2026-06-15", valueCents: 52000000 }),
];
const goldHistory = [valuation({ date: "2026-01-02", valueCents: 1520000 }), valuation({ date: "2026-10-01", valueCents: 1810000 })];

describe("buildSnapshot with assets", () => {
	it("reads an asset note into a record with its sorted valuations", () => {
		const snap = buildSnapshot([assetInput(house, [...houseHistory].reverse())]);
		expect(snap.assets).toEqual([
			{ path: assetPath("House"), asset: house, valuations: houseHistory, valuationIssues: [] },
		]);
	});

	it("keeps the unreadable rows of a note as issues", () => {
		const text = buildAssetNote(house, houseHistory).replace("| 2026-06-15 | 52000000 |", "| 2026-06-15 | oops |");
		const [record] = buildSnapshot([inputOf(assetPath("House"), text)]).assets;
		expect(record.valuations).toHaveLength(1);
		expect(record.valuationIssues).toHaveLength(1);
	});

	it("files a note with bad properties as invalid", () => {
		const text = buildAssetNote(house, houseHistory).replace("assetType: house", "assetType: boat");
		const snap = buildSnapshot([inputOf(assetPath("House"), text)]);
		expect(snap.assets).toEqual([]);
		expect(snap.invalid).toEqual([{ path: assetPath("House"), kind: "asset", reason: expect.stringMatching(/assetType/) }]);
	});

	it("sets a staged copy aside instead of counting it", () => {
		const staged = inputOf("Nestegg/Assets/House (in transit).md", markInTransit(buildAssetNote(house, houseHistory), assetPath("House")));
		const snap = buildSnapshot([staged]);
		expect(snap.assets).toEqual([]);
		expect(snap.transit).toEqual([{ path: staged.path, kind: "asset", transitFor: assetPath("House") }]);
	});

	it("starts empty", () => {
		expect(emptySnapshot().assets).toEqual([]);
	});
});

describe("activeAssets and findAsset", () => {
	const snap = buildSnapshot([assetInput(house, houseHistory), assetInput({ ...gold, active: false }, goldHistory)]);

	it("hides archived assets from the active list", () => {
		expect(activeAssets(snap).map((r) => r.asset.name)).toEqual(["House"]);
	});

	it("still finds an archived asset by name", () => {
		expect(findAsset(snap, "Gold")?.asset.active).toBe(false);
		expect(findAsset(snap, "Nope")).toBeUndefined();
	});
});

describe("assetsByType", () => {
	const car = asset({ name: "Car", assetType: "vehicle" });
	const silver = asset({ name: "Silver", assetType: "metal" });

	it("sums each active asset's latest value per type, in the fixed type order", () => {
		const snap = buildSnapshot([
			assetInput(silver, [valuation({ date: "2026-01-01", valueCents: 1 }), valuation({ date: "2026-09-01", valueCents: 400000 })]),
			assetInput(gold, goldHistory),
			assetInput(car, [valuation({ valueCents: 3000000 })]),
			assetInput(house, houseHistory),
		]);
		expect([...assetsByType(snap)]).toEqual([
			["house", 52000000],
			["vehicle", 3000000],
			["metal", 400000 + 1810000],
		]);
	});

	it("leaves out archived assets and types with nothing in them", () => {
		const snap = buildSnapshot([assetInput(house, houseHistory), assetInput({ ...gold, active: false }, goldHistory), assetInput(car, [valuation({ valueCents: 0 })])]);
		expect([...assetsByType(snap)]).toEqual([["house", 52000000]]);
	});

	it("is empty with no assets, and counts an asset with no rows as nothing", () => {
		expect(assetsByType(emptySnapshot()).size).toBe(0);
		expect(assetsByType(buildSnapshot([assetInput(house, [])])).size).toBe(0);
	});
});

describe("monthsFromFirstEntry", () => {
	const months = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];

	it("drops the months before the earliest valuation of any active asset", () => {
		const snap = buildSnapshot([
			assetInput(house, [valuation({ date: "2026-08-20" })]),
			assetInput(gold, [valuation({ date: "2026-09-02" })]),
		]);
		expect(monthsFromFirstEntry(snap, months)).toEqual(["2026-08", "2026-09", "2026-10"]);
	});

	it("keeps the whole range when the earliest entry is older than it", () => {
		const snap = buildSnapshot([assetInput(house, houseHistory)]);
		expect(monthsFromFirstEntry(snap, months)).toEqual(months);
	});

	it("starts at the month of the entry itself", () => {
		const snap = buildSnapshot([assetInput(house, [valuation({ date: "2026-07-01" })])]);
		expect(monthsFromFirstEntry(snap, months)[0]).toBe("2026-07");
	});

	it("ignores an archived asset's older entries", () => {
		const snap = buildSnapshot([
			assetInput(house, [valuation({ date: "2026-09-02" })]),
			assetInput({ ...gold, active: false }, [valuation({ date: "2020-01-01" })]),
		]);
		expect(monthsFromFirstEntry(snap, months)).toEqual(["2026-09", "2026-10"]);
	});

	it("is empty when nothing was ever entered", () => {
		expect(monthsFromFirstEntry(emptySnapshot(), months)).toEqual([]);
		expect(monthsFromFirstEntry(buildSnapshot([assetInput(house, [])]), months)).toEqual([]);
	});
});

describe("assetsTimeline", () => {
	const months = ["2022-08", "2022-09", "2026-01", "2026-06", "2026-10"];

	it("sums the active assets at each month end, counting zero before an asset's first row", () => {
		const snap = buildSnapshot([assetInput(house, houseHistory), assetInput(gold, goldHistory)]);
		expect([...assetsTimeline(snap, months)]).toEqual([
			["2022-08", 0],
			["2022-09", 45000000],
			["2026-01", 45000000 + 1520000],
			["2026-06", 52000000 + 1520000],
			["2026-10", 52000000 + 1810000],
		]);
	});

	it("takes a row dated late in the month into that month", () => {
		const snap = buildSnapshot([assetInput(house, [valuation({ date: "2026-06-30", valueCents: 7 })])]);
		expect(assetsTimeline(snap, ["2026-05", "2026-06"]).get("2026-06")).toBe(7);
		expect(assetsTimeline(snap, ["2026-05", "2026-06"]).get("2026-05")).toBe(0);
	});

	it("leaves out archived assets, so the whole history of one drops out of the total", () => {
		const snap = buildSnapshot([assetInput(house, houseHistory), assetInput({ ...gold, active: false }, goldHistory)]);
		expect(assetsTimeline(snap, ["2026-10"]).get("2026-10")).toBe(52000000);
	});

	it("is zero with no assets", () => {
		expect(assetsTimeline(emptySnapshot(), ["2026-10"]).get("2026-10")).toBe(0);
	});

	it("never feeds the accounts' net asset", () => {
		const accountsOnly = buildSnapshot(vaultInputs());
		const withAssets = buildSnapshot([...vaultInputs(), assetInput(house, houseHistory)]);
		expect(netAsset(withAssets)).toBe(netAsset(accountsOnly));
	});
});
