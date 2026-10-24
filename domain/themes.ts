// A theme is data: add an entry to THEMES and it appears in the settings dropdown and is styled
// everywhere Nestegg draws. Nothing else needs touching.

export interface Palette {
	scheme: "dark" | "light";
	bg: string; // page and modal background
	bgAlt: string; // cards, panels, rail
	text: string;
	muted: string;
	faint: string;
	border: string;
	accent: string;
	onAccent: string; // text drawn on the accent colour
	red: string;
	orange: string;
	yellow: string;
	green: string;
	cyan: string;
	blue: string;
	purple: string;
}

export interface Theme {
	id: string;
	name: string;
	// null follows the active Obsidian theme.
	palette: Palette | null;
}

export const THEMES = [
	{ id: "obsidian", name: "Match Obsidian", palette: null },
	{
		id: "xcode-dark",
		name: "Xcode Dark",
		palette: {
			scheme: "dark", bg: "#1f1f24", bgAlt: "#2a2a30", text: "#dfdfe0", muted: "#a0a1a7", faint: "#7f8c98",
			border: "#3b3b44", accent: "#6bdfff", onAccent: "#1f1f24",
			red: "#ff8170", orange: "#ffa14f", yellow: "#d9c97c", green: "#67b7a4", cyan: "#6bdfff", blue: "#4eb0cc", purple: "#b281eb",
		},
	},
	{
		id: "tokyo-night",
		name: "Tokyo Night",
		palette: {
			scheme: "dark", bg: "#1a1b26", bgAlt: "#24283b", text: "#c0caf5", muted: "#9aa5ce", faint: "#565f89",
			border: "#3b4261", accent: "#7aa2f7", onAccent: "#1a1b26",
			red: "#f7768e", orange: "#ff9e64", yellow: "#e0af68", green: "#9ece6a", cyan: "#7dcfff", blue: "#7aa2f7", purple: "#bb9af7",
		},
	},
	{
		id: "catppuccin-mocha",
		name: "Catppuccin Mocha",
		palette: {
			scheme: "dark", bg: "#1e1e2e", bgAlt: "#2a2b3c", text: "#cdd6f4", muted: "#a6adc8", faint: "#6c7086",
			border: "#45475a", accent: "#cba6f7", onAccent: "#1e1e2e",
			red: "#f38ba8", orange: "#fab387", yellow: "#f9e2af", green: "#a6e3a1", cyan: "#94e2d5", blue: "#89b4fa", purple: "#cba6f7",
		},
	},
	{
		id: "gruvbox-dark",
		name: "Gruvbox Dark",
		palette: {
			scheme: "dark", bg: "#282828", bgAlt: "#32302f", text: "#ebdbb2", muted: "#bdae93", faint: "#7c6f64",
			border: "#504945", accent: "#fe8019", onAccent: "#282828",
			red: "#fb4934", orange: "#fe8019", yellow: "#fabd2f", green: "#b8bb26", cyan: "#8ec07c", blue: "#83a598", purple: "#d3869b",
		},
	},
	{
		id: "nord",
		name: "Nord",
		palette: {
			scheme: "dark", bg: "#2e3440", bgAlt: "#3b4252", text: "#eceff4", muted: "#c5cddb", faint: "#7b88a1",
			border: "#4c566a", accent: "#88c0d0", onAccent: "#2e3440",
			red: "#bf616a", orange: "#d08770", yellow: "#ebcb8b", green: "#a3be8c", cyan: "#8fbcbb", blue: "#81a1c1", purple: "#b48ead",
		},
	},
] as const satisfies readonly Theme[];

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_IDS: readonly ThemeId[] = THEMES.map((theme) => theme.id);

export const DEFAULT_THEME: ThemeId = "obsidian";

export function isThemeId(value: unknown): value is ThemeId {
	return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

// Whatever was saved: an unknown or missing id falls back to following Obsidian.
export function parseTheme(raw: unknown): ThemeId {
	return isThemeId(raw) ? raw : DEFAULT_THEME;
}

export function themeName(id: ThemeId): string {
	return THEMES.find((theme) => theme.id === id)!.name;
}

// The Obsidian variables Nestegg's surfaces read, so every control inside them (inputs, buttons,
// dividers) follows the palette without a rule of its own. Its own --ne-* colours derive from
// these in styles.css.
export function paletteVars(p: Palette): Record<string, string> {
	return {
		"--ne-scheme": p.scheme,
		"--background-primary": p.bg,
		"--background-primary-alt": p.bgAlt,
		"--background-secondary": p.bgAlt,
		"--background-secondary-alt": p.bgAlt,
		"--background-modifier-border": p.border,
		"--background-modifier-border-hover": `color-mix(in srgb, ${p.border} 70%, ${p.text})`,
		"--background-modifier-hover": `color-mix(in srgb, ${p.text} 8%, transparent)`,
		"--background-modifier-form-field": p.bg,
		"--text-normal": p.text,
		"--text-muted": p.muted,
		"--text-faint": p.faint,
		"--text-on-accent": p.onAccent,
		"--text-error": p.red,
		"--text-warning": p.orange,
		"--text-success": p.green,
		"--interactive-normal": `color-mix(in srgb, ${p.bgAlt} 88%, ${p.text})`,
		"--interactive-hover": `color-mix(in srgb, ${p.bgAlt} 78%, ${p.text})`,
		"--interactive-accent": p.accent,
		"--interactive-accent-hover": `color-mix(in srgb, ${p.accent} 85%, white)`,
		"--color-red": p.red,
		"--color-orange": p.orange,
		"--color-yellow": p.yellow,
		"--color-green": p.green,
		"--color-cyan": p.cyan,
		"--color-blue": p.blue,
		"--color-purple": p.purple,
	};
}

// The body attribute the plugin sets to the chosen theme's id; following Obsidian sets none.
export const THEME_ATTRIBUTE = "data-nestegg-theme";

// The stylesheet text for a theme: one rule on .ne-scope, the class every Nestegg view and dialog
// carries, active while the body carries the theme's id. Following Obsidian needs none.
export function themeCss(id: ThemeId): string {
	const theme: Theme = THEMES.find((entry) => entry.id === id)!;
	if (!theme.palette) return "";
	const body = Object.entries(paletteVars(theme.palette))
		.map(([name, value]) => `  ${name}: ${value};`)
		.join("\n");
	return `body[${THEME_ATTRIBUTE}="${id}"] .ne-scope {\n${body}\n}\n`;
}

// What the "Themes" block at the end of styles.css must contain. Obsidian only loads a static
// styles.css, so a theme added to THEMES needs this block pasted there; a test fails until it is.
export function allThemesCss(): string {
	return THEME_IDS.map(themeCss).filter(Boolean).join("\n");
}
