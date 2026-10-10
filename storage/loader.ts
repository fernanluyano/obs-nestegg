import { kindOf, stateOf } from "../notes/kinds";
import { buildSnapshot, type NoteInput, type Snapshot } from "../snapshot/snapshot";
import type { VaultPort } from "./VaultPort";

// Properties come from the port's note list; table bodies are read only for the kinds that
// have one, and never for staged copies, which don't count toward data.
export async function loadInputs(port: VaultPort): Promise<NoteInput[]> {
	const notes = await port.listNotes();
	const inputs: NoteInput[] = [];
	for (const { path, props } of notes) {
		const kind = kindOf(props);
		if (!kind) continue;
		const hasTable = kind === "account" || kind === "category" || kind === "transactions" || kind === "budget";
		const content = hasTable && stateOf(props) === "current" ? ((await port.read(path)) ?? "") : "";
		inputs.push({ path, props, content });
	}
	return inputs;
}

export async function loadSnapshot(port: VaultPort): Promise<Snapshot> {
	return buildSnapshot(await loadInputs(port));
}
