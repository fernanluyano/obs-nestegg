import { DEFAULT_SETTINGS } from "../domain/defaults";
import type { Settings } from "../domain/types";
import { patchSettingsNote, buildSettingsNote } from "../notes/settingsNote";
import { SETTINGS_PATH } from "../notes/paths";
import type { LedgerStore } from "./LedgerStore";

export class SettingsService {
	constructor(private store: LedgerStore) {}

	get current(): Settings {
		return this.store.snapshot.settings?.settings ?? DEFAULT_SETTINGS;
	}

	async update(patch: Partial<Settings>): Promise<void> {
		const next = { ...this.current, ...patch };
		const known = this.store.snapshot.settings;
		if (known) await this.store.port.modify(known.path, (c) => patchSettingsNote(c, next));
		else await this.store.port.create(SETTINGS_PATH, buildSettingsNote(next));
		await this.store.reload();
	}
}
