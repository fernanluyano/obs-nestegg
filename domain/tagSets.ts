import { normalizeTags } from "./names";
import type { TagSet } from "./types";

// Names cannot contain "|" (see nameProblem), so it safely separates the name from the tags.
export function encodeTagSet(set: TagSet): string {
	return `${set.name}|${set.tags.join(",")}`;
}

export function decodeTagSet(raw: string): TagSet | null {
	const at = raw.indexOf("|");
	if (at < 0) return null;
	const name = raw.slice(0, at).trim();
	const tags = normalizeTags(raw.slice(at + 1).split(","));
	return name && tags.length > 0 ? { name, tags } : null;
}

export function decodeTagSets(raw: string[]): TagSet[] {
	return raw.map(decodeTagSet).filter((set): set is TagSet => set !== null);
}

// Saving under an existing name replaces that set's tags in place.
export function saveTagSet(sets: readonly TagSet[], set: TagSet): TagSet[] {
	const known = sets.some((s) => s.name === set.name);
	return known ? sets.map((s) => (s.name === set.name ? set : s)) : [...sets, set];
}

export function renameTagSet(sets: readonly TagSet[], from: string, to: string): TagSet[] {
	return sets.filter((s) => s.name !== to || s.name === from).map((s) => (s.name === from ? { ...s, name: to } : s));
}

export function removeTagSet(sets: readonly TagSet[], name: string): TagSet[] {
	return sets.filter((s) => s.name !== name);
}

export function findTagSetByTags(sets: readonly TagSet[], tags: ReadonlySet<string>): TagSet | undefined {
	return sets.find((s) => s.tags.length === tags.size && s.tags.every((tag) => tags.has(tag)));
}
