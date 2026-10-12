import { dirname, ROOT_FOLDER } from "../notes/paths";
import type { VaultPort } from "./VaultPort";

const PROTECTED = new Set([ROOT_FOLDER, `${ROOT_FOLDER}/Accounts`, `${ROOT_FOLDER}/Categories`, `${ROOT_FOLDER}/Assets`]);

// After files move out, drop the folders they leave empty (an account's old folder and its
// Transactions folder), deepest first and each once, never the plugin's own top-level folders.
export async function cleanupEmptyFolders(port: VaultPort, movedFromPaths: string[]): Promise<void> {
	const dirs = new Set<string>();
	for (const path of movedFromPaths) {
		for (let dir = dirname(path); dir !== "" && !PROTECTED.has(dir); dir = dirname(dir)) dirs.add(dir);
	}
	const deepestFirst = [...dirs].sort((a, b) => b.split("/").length - a.split("/").length);
	for (const dir of deepestFirst) await port.removeFolderIfEmpty(dir);
}
