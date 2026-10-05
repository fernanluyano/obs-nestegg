import { describe, expect, it } from "vitest";
import { ACCOUNT_COLORS, DEFAULT_ACCOUNT_COLOR, isHexColor, nextAccountColor } from "../../domain/colors";

describe("isHexColor", () => {
	it("accepts #rrggbb in either case", () => {
		expect(isHexColor("#1d9e75")).toBe(true);
		expect(isHexColor("#1D9E75")).toBe(true);
	});

	it.each(["", "red", "#fff", "#12345", "#1234567", "#12345g", "1d9e75", " #1d9e75"])("rejects %j", (text) => {
		expect(isHexColor(text)).toBe(false);
	});
});

describe("palette", () => {
	it("is made of valid, distinct colors that include the default", () => {
		expect(ACCOUNT_COLORS.every(isHexColor)).toBe(true);
		expect(new Set(ACCOUNT_COLORS).size).toBe(ACCOUNT_COLORS.length);
		expect(ACCOUNT_COLORS).toContain(DEFAULT_ACCOUNT_COLOR);
	});
});

describe("nextAccountColor", () => {
	it("starts with the first palette color", () => {
		expect(nextAccountColor([])).toBe(ACCOUNT_COLORS[0]);
	});

	it("skips colors in use, whatever their case, and fills gaps", () => {
		expect(nextAccountColor([ACCOUNT_COLORS[0].toUpperCase(), ACCOUNT_COLORS[2]])).toBe(ACCOUNT_COLORS[1]);
	});

	it("starts over once the palette is used up", () => {
		const used = [...ACCOUNT_COLORS, "#000000"];
		expect(nextAccountColor(used)).toBe(ACCOUNT_COLORS[used.length % ACCOUNT_COLORS.length]);
	});
});
