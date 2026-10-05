import type { RawProps } from "../notes/frontmatter";

export interface VaultNote {
	path: string;
	props: RawProps;
}

// Everything the plugin needs from the vault, so the logic above it runs against an in-memory
// fake in tests. The Obsidian adapter is the only implementation that touches the real API.
export interface VaultPort {
	// Every markdown note with its properties; callers filter by tag.
	listNotes(): Promise<VaultNote[]>;
	read(path: string): Promise<string | null>;
	exists(path: string): boolean;
	// Creates missing folders; throws if the file already exists.
	create(path: string, content: string): Promise<void>;
	// Atomic read-modify-write; returns the new content.
	modify(path: string, fn: (content: string) => string): Promise<string>;
	// Creates missing destination folders; throws if the destination exists.
	rename(from: string, to: string): Promise<void>;
	// Moves to the trash rather than deleting for good.
	trash(path: string): Promise<void>;
	removeFolderIfEmpty(path: string): Promise<void>;
}
