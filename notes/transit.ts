import { patchProps } from "./frontmatter";

// A staged copy records which file it replaces, so recovery can finish or undo the swap
// even when the rename changed the note's own identity.
export function markInTransit(content: string, replacesPath: string): string {
	return patchProps(content, { state: "in_transit", transitFor: replacesPath });
}

export function markCurrent(content: string): string {
	return patchProps(content, { state: "current", transitFor: undefined });
}
