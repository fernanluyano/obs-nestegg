import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, allThemesCss,THEMES, THEME_IDS, isThemeId, paletteVars, parseTheme, themeCss, themeName } from "../../domain/themes";

describe("themes", () => {
	it("lists every theme once, starting with the one that follows Obsidian", () => {
		expect(THEME_IDS[0]).toBe(DEFAULT_THEME);
		expect(new Set(THEME_IDS).size).toBe(THEMES.length);
		expect(THEMES[0].palette).toBeNull();
	});

	it("recognises every listed id and nothing else", () => {
		for (const id of THEME_IDS) expect(isThemeId(id)).toBe(true);
		expect(isThemeId("solarized")).toBe(false);
		expect(isThemeId(undefined)).toBe(false);
		expect(isThemeId(3)).toBe(false);
	});

	it("falls back to following Obsidian", () => {
		expect(parseTheme("nord")).toBe("nord");
		expect(parseTheme("nope")).toBe(DEFAULT_THEME);
		expect(parseTheme(null)).toBe(DEFAULT_THEME);
	});

	it("names each theme", () => {
		expect(themeName("tokyo-night")).toBe("Tokyo Night");
	});

	it("every preset is a complete palette of valid colours", () => {
		for (const { palette } of THEMES) {
			if (!palette) continue;
			const { scheme, ...colours } = palette;
			expect(["dark", "light"]).toContain(scheme);
			for (const value of Object.values(colours)) expect(value).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});

	it("maps a palette onto the Obsidian variables Nestegg reads", () => {
		const palette = THEMES[2].palette;
		const vars = paletteVars(palette);
		expect(vars["--background-primary"]).toBe(palette.bg);
		expect(vars["--interactive-accent"]).toBe(palette.accent);
		expect(vars["--color-green"]).toBe(palette.green);
		expect(vars["--ne-scheme"]).toBe("dark");
	});

	it("emits one scoped rule per preset and nothing for the default", () => {
		expect(themeCss(DEFAULT_THEME)).toBe("");
		const css = themeCss("nord");
		expect(css.startsWith('body[data-nestegg-theme="nord"] .ne-scope {')).toBe(true);
		expect(css).toContain("--background-primary: #2e3440;");
	});

	it("ships every preset's rule in styles.css", () => {
		const stylesheet = readFileSync(fileURLToPath(new URL("../../styles.css", import.meta.url)), "utf8");
		expect(stylesheet).toContain(allThemesCss());
	});
});
