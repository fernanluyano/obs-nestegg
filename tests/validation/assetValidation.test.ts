import { describe, expect, it } from "vitest";
import { buildAssetNote } from "../../notes/assetNote";
import { assetPath } from "../../notes/paths";
import { detectDuplicateAssets } from "../../validation/assetIssues";
import { describeIssue } from "../../validation/describe";
import { detectMalformedRows } from "../../validation/monthIssues";
import { detectPathMismatches } from "../../validation/noteIssues";
import { validateSnapshot } from "../../validation/validate";
import { asset, assetInput, inputOf, snapshotOf, valuation, vaultInputs } from "../helpers/fixtures";

const house = asset();

describe("asset validation", () => {
	it("finds nothing wrong with a healthy asset", () => {
		expect(validateSnapshot(snapshotOf([...vaultInputs(), assetInput(house)]))).toEqual([]);
	});

	it("reports two notes holding the same asset name", () => {
		const copy = inputOf("Nestegg/Assets/House copy.md", buildAssetNote(house, [valuation()]));
		const snap = snapshotOf([assetInput(house), copy]);
		const issues = detectDuplicateAssets(snap);
		expect(issues).toEqual([
			{ type: "duplicateName", kind: "asset", name: "House", paths: ["Nestegg/Assets/House copy.md", assetPath("House")] },
		]);
		expect(describeIssue(issues[0]).text).toBe(
			`Two or more asset notes are named "House": Nestegg/Assets/House copy.md, ${assetPath("House")}`,
		);
		expect(validateSnapshot(snap).map((i) => i.type)).toContain("duplicateName");
	});

	it("does not flag assets with different names", () => {
		const snap = snapshotOf([assetInput(house), assetInput(asset({ name: "Gold", assetType: "metal" }))]);
		expect(detectDuplicateAssets(snap)).toEqual([]);
	});

	it("reports an unreadable or duplicate-date row with its line", () => {
		const text = buildAssetNote(house, [valuation()]).replace("| 52000000 |", "| oops |");
		const issues = detectMalformedRows(snapshotOf([inputOf(assetPath("House"), text)]));
		expect(issues).toEqual([
			{ type: "malformedRow", path: assetPath("House"), line: 12, reason: expect.stringMatching(/ValueCents/), text: expect.any(String) },
		]);
		expect(describeIssue(issues[0]).text).toMatch(/^House, line 12: ValueCents must be an integer/);
	});

	it("reports a note that is not at the path its name gives, and offers the move", () => {
		const moved = inputOf("Nestegg/Assets/Elsewhere/House.md", buildAssetNote(house, [valuation()]));
		const [issue] = detectPathMismatches(snapshotOf([moved]));
		expect(issue).toEqual({ type: "pathMismatch", kind: "asset", path: moved.path, expectedPath: assetPath("House") });
		expect(describeIssue(issue).fixes[0].action).toEqual({ kind: "moveToExpectedPath", path: moved.path, expectedPath: assetPath("House") });
	});

	it("reports a note with bad properties as invalid", () => {
		const bad = inputOf(assetPath("House"), buildAssetNote(house, [valuation()]).replace("assetType: house", "assetType: boat"));
		const [issue] = validateSnapshot(snapshotOf([bad]));
		expect(issue).toMatchObject({ type: "invalidNote", kind: "asset", path: assetPath("House") });
	});
});
