import { describe, expect, it } from "vitest";
import { centsToDecimal, formatCents, parseCents } from "../money";

describe("parseCents", () => {
	it("parses whole and fractional amounts", () => {
		expect(parseCents("12")).toBe(1200);
		expect(parseCents("12.5")).toBe(1250);
		expect(parseCents("12.34")).toBe(1234);
		expect(parseCents("0.07")).toBe(7);
	});

	it("avoids float error", () => {
		expect(parseCents("1.15")).toBe(115);
		expect(parseCents("19.99")).toBe(1999);
	});

	it("handles negatives", () => {
		expect(parseCents("-4.50")).toBe(-450);
		expect(parseCents("-0")).toBe(0);
	});

	it("rejects malformed input", () => {
		for (const bad of ["", "-", "abc", "1.234", "1,234", ".5", "1.", "1e3", "--1"]) {
			expect(parseCents(bad)).toBeNull();
		}
	});

	it("rejects amounts beyond safe integer cents", () => {
		expect(parseCents("99999999999999999")).toBeNull();
	});
});

describe("centsToDecimal", () => {
	it("formats with two decimals", () => {
		expect(centsToDecimal(1234)).toBe("12.34");
		expect(centsToDecimal(1200)).toBe("12.00");
		expect(centsToDecimal(7)).toBe("0.07");
		expect(centsToDecimal(0)).toBe("0.00");
	});

	it("formats negatives", () => {
		expect(centsToDecimal(-450)).toBe("-4.50");
		expect(centsToDecimal(-5)).toBe("-0.05");
	});

	it("round-trips through parseCents", () => {
		for (const c of [0, 1, 99, 100, 101, 115, 123456789, -1, -115]) {
			expect(parseCents(centsToDecimal(c))).toBe(c);
		}
	});
});

describe("formatCents", () => {
	it("groups thousands and keeps two decimals", () => {
		expect(formatCents(0)).toBe("0.00");
		expect(formatCents(5)).toBe("0.05");
		expect(formatCents(123456789)).toBe("1,234,567.89");
		expect(formatCents(-100000)).toBe("-1,000.00");
	});
});
