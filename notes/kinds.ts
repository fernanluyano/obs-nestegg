import { list, str, type RawProps } from "./frontmatter";

export const NOTE_TAGS = {
	account: "nestegg/account",
	category: "nestegg/category",
	transactions: "nestegg/transactions",
	settings: "nestegg/settings",
} as const;

export type NoteKind = keyof typeof NOTE_TAGS;

export const NOTE_KINDS = Object.keys(NOTE_TAGS) as NoteKind[];

export type NoteState = "current" | "in_transit";

export function hasTag(props: RawProps, tag: string): boolean {
	return list(props, "tags").some((t) => t.replace(/^#/, "") === tag);
}

export function kindOf(props: RawProps): NoteKind | null {
	return NOTE_KINDS.find((kind) => hasTag(props, NOTE_TAGS[kind])) ?? null;
}

// A missing or unknown state reads as current, so notes written before the property existed still count.
export function stateOf(props: RawProps): NoteState {
	return str(props, "state") === "in_transit" ? "in_transit" : "current";
}

export function transitForOf(props: RawProps): string | undefined {
	return str(props, "transitFor") || undefined;
}
