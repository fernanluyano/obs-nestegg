import { describe, expect, it } from "vitest";
import { CHANGELOG, getChangelogEntry, isUpdateFrom } from "../../changelog";

describe("changelog", () => {
	it("finds an entry by version", () => {
		const newest = CHANGELOG[0];
		expect(getChangelogEntry(newest.version)).toBe(newest);
		expect(newest.highlights.length).toBeGreaterThan(0);
	});

	it("has unique versions", () => {
		const versions = CHANGELOG.map((e) => e.version);
		expect(new Set(versions).size).toBe(versions.length);
	});

	it("flags an update only when a different version was seen before", () => {
		expect(isUpdateFrom(undefined, "0.3.0")).toBe(false);
		expect(isUpdateFrom("0.3.0", "0.3.0")).toBe(false);
		expect(isUpdateFrom("0.2.0", "0.3.0")).toBe(true);
	});

	it("returns undefined for an unknown version", () => {
		expect(getChangelogEntry("0.0.0")).toBeUndefined();
	});
});
