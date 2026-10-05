import { describe, expect, it } from "vitest";
import { isIsoDate, isYearMonth, monthEndKey, monthOf, todayString } from "../../domain/dates";

describe("isIsoDate", () => {
	it("accepts real calendar dates", () => {
		expect(isIsoDate("2026-10-04")).toBe(true);
		expect(isIsoDate("2024-02-29")).toBe(true);
	});

	it("rejects impossible dates and wrong shapes", () => {
		expect(isIsoDate("2026-02-30")).toBe(false);
		expect(isIsoDate("2025-02-29")).toBe(false);
		expect(isIsoDate("2026-13-01")).toBe(false);
		expect(isIsoDate("2026-1-1")).toBe(false);
		expect(isIsoDate("10/04")).toBe(false);
		expect(isIsoDate("")).toBe(false);
	});
});

describe("isYearMonth", () => {
	it("accepts YYYY-MM with a valid month", () => {
		expect(isYearMonth("2026-10")).toBe(true);
		expect(isYearMonth("2026-01")).toBe(true);
	});

	it("rejects other shapes", () => {
		expect(isYearMonth("2026-00")).toBe(false);
		expect(isYearMonth("2026-13")).toBe(false);
		expect(isYearMonth("2026-10-01")).toBe(false);
		expect(isYearMonth("26-10")).toBe(false);
	});
});

describe("monthOf / monthEndKey", () => {
	it("takes the month from a date", () => {
		expect(monthOf("2026-10-04")).toBe("2026-10");
	});

	it("sorts at or after every date in the month and before the next month", () => {
		const end = monthEndKey("2026-10");
		expect("2026-10-31" <= end).toBe(true);
		expect("2026-10-01" <= end).toBe(true);
		expect("2026-11-01" > end).toBe(true);
	});
});

describe("todayString", () => {
	it("formats with zero padding", () => {
		expect(todayString(new Date(2026, 0, 5))).toBe("2026-01-05");
		expect(todayString(new Date(2026, 11, 25))).toBe("2026-12-25");
	});

	it("defaults to now", () => {
		expect(isIsoDate(todayString())).toBe(true);
	});
});
