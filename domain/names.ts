// Characters that break file names, wikilinks or table cells.
const FORBIDDEN_NAME_CHARS = /[\\/:*?"<>|#^[\]]/;

export type NameProblem = "empty" | "invalid";

export function nameProblem(name: string): NameProblem | null {
	const trimmed = name.trim();
	if (!trimmed) return "empty";
	if (FORBIDDEN_NAME_CHARS.test(trimmed) || trimmed.startsWith(".") || trimmed !== name) return "invalid";
	return null;
}

export function miscName(category: string): string {
	return `${category} - Misc`;
}

export function normalizeTag(raw: string): string {
	return raw.trim().replace(/^#/, "").trim().toLowerCase();
}

export function normalizeTags(tags: string[]): string[] {
	const seen = new Set<string>();
	for (const tag of tags) {
		const normalized = normalizeTag(tag);
		if (normalized) seen.add(normalized);
	}
	return [...seen];
}
