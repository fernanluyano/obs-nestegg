import { describe, expect, it } from "vitest";
import { parseProps } from "../../notes/frontmatter";
import { buildSettingsNote, parseSettingsProps, patchSettingsNote } from "../../notes/settingsNote";

describe("settings note", () => {
	const settings = { defaultAccount: "Cash Main", autoValidateOnLoad: false };

	it("round trips", () => {
		expect(parseSettingsProps(parseProps(buildSettingsNote(settings)))).toEqual(settings);
	});

	it("writes the marker tag and state", () => {
		expect(parseProps(buildSettingsNote(settings))).toMatchObject({ tags: ["nestegg/settings"], state: "current" });
	});

	it("falls back to defaults", () => {
		expect(parseSettingsProps({})).toEqual({ defaultAccount: "", autoValidateOnLoad: true });
		expect(parseSettingsProps({ defaultAccount: "  " })).toMatchObject({ defaultAccount: "" });
	});

	it("patches only its own properties", () => {
		const original = buildSettingsNote(settings).replace("---\n", "---\nextra: keep\n");
		const patched = patchSettingsNote(original, { defaultAccount: "Other", autoValidateOnLoad: true });
		expect(parseProps(patched)).toMatchObject({ extra: "keep", defaultAccount: "Other", autoValidateOnLoad: true });
	});
});
