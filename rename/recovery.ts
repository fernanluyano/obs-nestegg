import { markCurrent } from "../notes/transit";
import { parseProps } from "../notes/frontmatter";
import { transitForOf } from "../notes/kinds";
import { cleanupEmptyFolders } from "../storage/folders";
import type { VaultPort } from "../storage/VaultPort";
import { RenameError } from "./types";

const SUFFIX = " (in transit).md";

// The reverse of transitPath: a staged copy always sits at its final path plus the suffix.
export function finalPathOf(stagedPath: string): string {
	if (!stagedPath.endsWith(SUFFIX)) throw new RenameError(`${stagedPath} is not a staged copy`);
	return `${stagedPath.slice(0, -SUFFIX.length)}.md`;
}

export async function discardTransit(port: VaultPort, stagedPath: string): Promise<void> {
	await port.trash(stagedPath);
}

// Finishes an interrupted swap: removes the note it was meant to replace (if still there), puts the
// staged copy at its final path and marks it current. Nothing is removed until the staged copy
// is known to be readable.
export async function promoteTransit(port: VaultPort, stagedPath: string): Promise<void> {
	const finalPath = finalPathOf(stagedPath);
	const content = await port.read(stagedPath);
	if (content === null) throw new RenameError(`${stagedPath} no longer exists`);

	const replaces = transitForOf(parseProps(content));
	if (port.exists(finalPath) && finalPath !== replaces) throw new RenameError(`${finalPath} already exists`);

	if (replaces && port.exists(replaces)) await port.trash(replaces);
	await port.rename(stagedPath, finalPath);
	await port.modify(finalPath, markCurrent);
	if (replaces && replaces !== finalPath) await cleanupEmptyFolders(port, [replaces]);
}
