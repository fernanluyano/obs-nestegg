import { DEFAULT_SETTINGS } from "../domain/defaults";
import { decodeTagSets, encodeTagSet } from "../domain/tagSets";
import type { Settings } from "../domain/types";
import { bool, buildNote, list, patchProps, str, type RawProps } from "./frontmatter";
import { NOTE_TAGS } from "./kinds";

export function parseSettingsProps(props: RawProps): Settings {
	return {
		defaultAccount: str(props, "defaultAccount")?.trim() || DEFAULT_SETTINGS.defaultAccount,
		autoValidateOnLoad: bool(props, "autoValidateOnLoad") ?? DEFAULT_SETTINGS.autoValidateOnLoad,
		tagSets: decodeTagSets(Array.isArray(props["tagSets"]) ? list(props, "tagSets") : []),
	};
}

// An empty list leaves the key out, so notes without saved tag sets stay as they were.
export function buildSettingsNote(settings: Settings): string {
	return buildNote(
		{
			tags: [NOTE_TAGS.settings],
			state: "current",
			defaultAccount: settings.defaultAccount,
			autoValidateOnLoad: settings.autoValidateOnLoad,
			tagSets: settings.tagSets.length > 0 ? settings.tagSets.map(encodeTagSet) : undefined,
		},
		"",
	);
}

export function patchSettingsNote(content: string, settings: Settings): string {
	return patchProps(content, {
		defaultAccount: settings.defaultAccount,
		autoValidateOnLoad: settings.autoValidateOnLoad,
		tagSets: settings.tagSets.length > 0 ? settings.tagSets.map(encodeTagSet) : undefined,
	});
}
