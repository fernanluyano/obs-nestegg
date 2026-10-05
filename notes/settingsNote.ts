import { DEFAULT_SETTINGS } from "../domain/defaults";
import type { Settings } from "../domain/types";
import { bool, buildNote, patchProps, str, type RawProps } from "./frontmatter";
import { NOTE_TAGS } from "./kinds";

export function parseSettingsProps(props: RawProps): Settings {
	return {
		defaultAccount: str(props, "defaultAccount")?.trim() || DEFAULT_SETTINGS.defaultAccount,
		autoValidateOnLoad: bool(props, "autoValidateOnLoad") ?? DEFAULT_SETTINGS.autoValidateOnLoad,
	};
}

export function buildSettingsNote(settings: Settings): string {
	return buildNote(
		{
			tags: [NOTE_TAGS.settings],
			state: "current",
			defaultAccount: settings.defaultAccount,
			autoValidateOnLoad: settings.autoValidateOnLoad,
		},
		"",
	);
}

export function patchSettingsNote(content: string, settings: Settings): string {
	return patchProps(content, {
		defaultAccount: settings.defaultAccount,
		autoValidateOnLoad: settings.autoValidateOnLoad,
	});
}
