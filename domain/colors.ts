// The ten colors an account can be given, in the order new accounts receive them, so the first few
// accounts get distinct colors without the user choosing any.
export const ACCOUNT_COLORS: readonly string[] = [
	"#3e63dd", "#30a46c", "#f76b15", "#e5484d", "#ab4aba",
	"#12a594", "#f5c518", "#d6409f", "#6e56cf", "#8b8d98",
];

// What an account note without a usable color falls back to (the palette's gray).
export const DEFAULT_ACCOUNT_COLOR = "#8b8d98";

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export function isHexColor(text: string): boolean {
	return HEX_COLOR_RE.test(text);
}

// The first palette color no existing account uses; once the palette is used up, it starts over.
export function nextAccountColor(used: string[]): string {
	const taken = new Set(used.map((c) => c.toLowerCase()));
	return ACCOUNT_COLORS.find((c) => !taken.has(c)) ?? ACCOUNT_COLORS[used.length % ACCOUNT_COLORS.length];
}
