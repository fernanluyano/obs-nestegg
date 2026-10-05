import type { Snapshot } from "../snapshot/snapshot";

// One note's before and after: the file at `fromPath` is replaced by `content` at `toPath`.
export interface FileChange {
	fromPath: string;
	toPath: string;
	content: string;
}

export interface RenamePlan {
	changes: FileChange[];
}

export interface PlanContext {
	snapshot: Snapshot;
	read(path: string): Promise<string>;
}

export class RenameError extends Error {}
