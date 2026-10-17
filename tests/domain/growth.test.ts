import { describe, expect, it } from "vitest";
import { cagr, formatPercent, growthPoints, percentChange, yearToDateRatio } from "../../domain/growth";

describe("percentChange", () => {
	it("is the change over the starting value", () => {
		expect(percentChange(10000, 11000)).toBeCloseTo(0.1);
		expect(percentChange(10000, 7500)).toBeCloseTo(-0.25);
	});

	it("is not defined from zero or a negative start", () => {
		expect(percentChange(0, 500)).toBeNull();
		expect(percentChange(-100, 500)).toBeNull();
	});
});

describe("cagr", () => {
	it("annualizes the growth over the span", () => {
		expect(cagr(100000, 121000, 24)).toBeCloseTo(0.1);
		expect(cagr(100000, 110000, 12)).toBeCloseTo(0.1);
		expect(cagr(100000, 133100, 36)).toBeCloseTo(0.1);
	});

	it("is not defined under a year, or when either end is not positive", () => {
		expect(cagr(100000, 110000, 3)).toBeNull();
		expect(cagr(100000, 110000, 11)).toBeNull();
		expect(cagr(0, 110000, 24)).toBeNull();
		expect(cagr(100000, 0, 24)).toBeNull();
		expect(cagr(100000, -5, 24)).toBeNull();
	});
});

describe("formatPercent", () => {
	it("signs and rounds to one decimal", () => {
		expect(formatPercent(0.1234)).toBe("+12.3%");
		expect(formatPercent(-0.05)).toBe("-5.0%");
		expect(formatPercent(0)).toBe("0.0%");
	});

	it("says n/a when undefined", () => {
		expect(formatPercent(null)).toBe("n/a");
	});
});

describe("yearToDateRatio", () => {
	const months = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03"];
	const values = [5000, 6000, 8000, 9000, 10000];

	it("runs from January of the latest year when the data reaches back that far", () => {
		expect(yearToDateRatio(months, values)).toBeCloseTo((10000 - 8000) / 8000); // +25%
	});

	it("runs from the first month with data when the year started later", () => {
		expect(yearToDateRatio(months, values, 3)).toBeCloseTo((10000 - 9000) / 9000);
	});

	it("is n/a with a single month in the year, no months, or a start that is not positive", () => {
		expect(yearToDateRatio(months, values, 4)).toBeNull();
		expect(yearToDateRatio([], [])).toBeNull();
		expect(yearToDateRatio(["2026-01", "2026-02"], [0, 500])).toBeNull();
		expect(yearToDateRatio(months, values, 99)).toBeNull();
	});
});

// Free cash flow, USD millions, from a published statements table (oldest first, FY2016 to FY2025),
// with its TTM figure and the CAGR that table shows (15.3%). The functions do not care about units.
describe("free cash flow, a published example", () => {
	const fcf = { 2016: 403, 2017: 476, 2018: 816, 2019: 434, 2020: 925, 2021: 1357, 2022: 508, 2023: 438, 2024: 958, 2025: 1182 };
	const ttm = 1626;
	const yoy = (year: keyof typeof fcf) => formatPercent(percentChange(fcf[(year - 1) as keyof typeof fcf], fcf[year]));

	it("gives the year over year of each year, up and down", () => {
		expect(yoy(2025)).toBe("+23.4%"); // 1,182 / 958
		expect(yoy(2024)).toBe("+118.7%"); // 958 / 438
		expect(yoy(2023)).toBe("-13.8%"); // 438 / 508
		expect(yoy(2022)).toBe("-62.6%"); // 508 / 1,357
		expect(yoy(2021)).toBe("+46.7%"); // 1,357 / 925
	});

	it("gives the CAGR over the nine years from FY2016 to FY2025", () => {
		// (1,182 / 403) ^ (1 / 9) - 1
		expect(cagr(fcf[2016], fcf[2025], 108)).toBeCloseTo(Math.pow(1182 / 403, 1 / 9) - 1, 10);
		expect(formatPercent(cagr(fcf[2016], fcf[2025], 108))).toBe("+12.7%");
	});

	it("matches the table's 15.3% from FY2016 to the trailing twelve months, about 9.75 years on", () => {
		expect(cagr(fcf[2016], ttm, 117)).toBeCloseTo(0.153, 2);
	});

	it("is n/a under a year, even for this series", () => {
		expect(cagr(fcf[2024], fcf[2025], 11)).toBeNull();
	});
});

describe("growthPoints", () => {
	const months = Array.from({ length: 14 }, (_, i) => `2025-${String(i + 1).padStart(2, "0")}`);
	const values = months.map((_, i) => (i + 1) * 1000);

	it("compares each month with the previous one and with a year earlier", () => {
		const points = growthPoints(months, values, 12);
		expect(points.map((p) => p.month)).toEqual([months[12], months[13]]);
		expect(points[0]).toEqual({ month: months[12], cents: 13000, changeCents: 1000, changeRatio: 1000 / 12000, yoyRatio: 12000 / 1000 });
		expect(points[1].yoyRatio).toBeCloseTo(12000 / 2000);
	});

	it("leaves the comparisons empty where there is nothing to compare with", () => {
		const [first, second] = growthPoints(months, values, 0);
		expect(first).toEqual({ month: months[0], cents: 1000, changeCents: null, changeRatio: null, yoyRatio: null });
		expect(second.changeCents).toBe(1000);
		expect(second.yoyRatio).toBeNull();
	});

	it("never compares with months before the first real data", () => {
		const [first, second] = growthPoints(months, values, 5, 5);
		expect(first.changeCents).toBeNull();
		expect(first.changeRatio).toBeNull();
		expect(second.changeCents).toBe(1000);
		const [late] = growthPoints(months, values, 12, 5);
		expect(late.changeCents).toBe(1000);
		expect(late.yoyRatio).toBeNull();
		expect(growthPoints(months, values, 12, 1)[0].yoyRatio).toBeNull();
		expect(growthPoints(months, values, 12, 0)[0].yoyRatio).toBeCloseTo(12);
	});

	it("keeps the change but not the percent when the previous month was zero", () => {
		const [, point] = growthPoints(["2026-01", "2026-02"], [0, 500], 0);
		expect(point.changeCents).toBe(500);
		expect(point.changeRatio).toBeNull();
	});
});
