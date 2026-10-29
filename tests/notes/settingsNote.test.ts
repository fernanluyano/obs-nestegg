import { describe, expect, it } from "vitest";
import { parseProps } from "../../notes/frontmatter";
import { buildSettingsNote, parseSettingsProps, patchSettingsNote } from "../../notes/settingsNote";

describe("settings note", () => {
	const settings = { defaultAccount: "Cash Main", autoValidateOnLoad: false, tagSets: [] };

	it("round trips", () => {
		expect(parseSettingsProps(parseProps(buildSettingsNote(settings)))).toEqual(settings);
	});

	it("round trips tag sets, with one or several tags", () => {
		const withSets = { ...settings, tagSets: [{ name: "Eating out", tags: ["dining", "publix"] }, { name: "Needs", tags: ["need"] }] };
		expect(parseSettingsProps(parseProps(buildSettingsNote(withSets)))).toEqual(withSets);
	});

	it("writes the marker tag and state", () => {
		expect(parseProps(buildSettingsNote(settings))).toMatchObject({ tags: ["nestegg/settings"], state: "current" });
	});

	it("falls back to defaults", () => {
		expect(parseSettingsProps({})).toEqual({ defaultAccount: "", autoValidateOnLoad: true, tagSets: [] });
		expect(parseSettingsProps({ defaultAccount: "  " })).toMatchObject({ defaultAccount: "" });
	});

	it("patches only its own properties", () => {
		const original = buildSettingsNote(settings).replace("---\n", "---\nextra: keep\n");
		const patched = patchSettingsNote(original, { defaultAccount: "Other", autoValidateOnLoad: true, tagSets: [{ name: "A", tags: ["x"] }] });
		expect(parseProps(patched)).toMatchObject({ extra: "keep", defaultAccount: "Other", autoValidateOnLoad: true, tagSets: ["A|x"] });
	});

	it("removes the tag sets key when the last set is deleted", () => {
		const withSet = buildSettingsNote({ ...settings, tagSets: [{ name: "A", tags: ["x"] }] });
		expect(parseProps(patchSettingsNote(withSet, settings))).not.toHaveProperty("tagSets");
	});
});
