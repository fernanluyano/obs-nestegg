import { describe, expect, it } from "vitest";
import { CHANGELOG, getChangelogEntry } from "../changelog";

describe("getChangelogEntry", () => {
	it("returns the entry for a known version", () => {
		const entry = CHANGELOG[0];
		expect(getChangelogEntry(entry.version)).toBe(entry);
	});

	it("returns undefined for an unknown version", () => {
		expect(getChangelogEntry("0.0.0-nope")).toBeUndefined();
	});
});
