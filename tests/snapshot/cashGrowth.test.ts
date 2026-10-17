import { describe, expect, it } from "vitest";
import { cagr, formatPercent, growthPoints, yearToDateRatio } from "../../domain/growth";
import { cashOnHandTimeline, cashStartMonth } from "../../snapshot/queries";
import { buildSnapshot } from "../../snapshot/snapshot";
import { account, monthInput, tx, vaultInputs } from "../helpers/fixtures";

// A cash account opened at $1,000.00 on 2024-01-31 that gains exactly $8.75 every month for 24
// months, so every figure below can be checked by hand:
//   month k balance = 100,000 + 875k cents, ending at 121,000 ($1,210.00) in 2026-01.
const FIRST = "2024-01";
const LAST = "2026-01";

function monthsFrom(start: string, count: number): string[] {
	const [y, m] = start.split("-").map(Number);
	return Array.from({ length: count }, (_, i) => {
		const d = new Date(y, m - 1 + i, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
	});
}

const history = monthsFrom(FIRST, 25);
const snap = buildSnapshot(
	vaultInputs({
		accounts: [account({ enteredBalanceCents: 100000, enteredBalanceAsOf: "2024-01-31", balanceCents: 121000 })],
		months: history.slice(1).map((ym) => monthInput("Cash Main", ym, [tx({ date: `${ym}-15`, subcategory: "Salary", amountCents: 875 })])),
	}),
);

describe("cash on hand growth, with known numbers", () => {
	it("finds the balance at every month end", () => {
		const timeline = cashOnHandTimeline(snap, history);
		expect(timeline.get("2024-01")).toBe(100000);
		expect(timeline.get("2025-01")).toBe(110500);
		expect(timeline.get("2025-12")).toBe(120125);
		expect(timeline.get(LAST)).toBe(121000);
		expect(cashStartMonth(snap)).toBe(FIRST);
	});

	it("gives the month over month, year over year and CAGR of the last month", () => {
		const values = history.map((ym) => cashOnHandTimeline(snap, [ym]).get(ym)!);
		const last = growthPoints(history, values, 0, history.indexOf(FIRST)).at(-1)!;

		expect(last.cents).toBe(121000);
		expect(last.changeCents).toBe(875);
		expect(last.changeRatio).toBeCloseTo(875 / 120125, 10);
		expect(formatPercent(last.changeRatio)).toBe("+0.7%");
		// 110,500 a year earlier: (121,000 - 110,500) / 110,500
		expect(last.yoyRatio).toBeCloseTo(10500 / 110500, 10);
		expect(formatPercent(last.yoyRatio)).toBe("+9.5%");
		// 100,000 to 121,000 over 24 months: 1.21 ^ (1/2) - 1 = exactly 10%
		expect(cagr(values[0], values[24], 24)).toBeCloseTo(0.1, 10);
		expect(formatPercent(cagr(values[0], values[24], 24))).toBe("+10.0%");
	});

	it("shows year over year only from the thirteenth month of real data", () => {
		const values = history.map((ym) => cashOnHandTimeline(snap, [ym]).get(ym)!);
		const points = growthPoints(history, values, 0, 0);
		expect(points[11].yoyRatio).toBeNull();
		expect(points[12].yoyRatio).toBeCloseTo(10500 / 100000, 10);
	});

	it("does not compare with the replayed months before the first real data", () => {
		// Twelve lead-in months before the account existed hold the opening balance flat, which is not real history.
		const withLeadIn = [...monthsFrom("2023-01", 12), ...history];
		const values = withLeadIn.map((ym) => cashOnHandTimeline(snap, [ym]).get(ym)!);
		expect(values.slice(0, 12).every((v) => v === 100000)).toBe(true);

		const firstData = withLeadIn.indexOf(cashStartMonth(snap)!);
		const points = growthPoints(withLeadIn, values, 12, firstData);
		expect(points[0].month).toBe("2024-01");
		expect(points[0].changeCents).toBeNull(); // no real previous month
		expect(points[0].yoyRatio).toBeNull(); // the flat 2023 balance is not a real year ago
		expect(points[1].changeCents).toBe(875);
		expect(points[11].yoyRatio).toBeNull();
		expect(points[12].yoyRatio).toBeCloseTo(10500 / 100000, 10);
	});

	it("gives the year to date of a year that is fully on record, and of one that starts mid-year", () => {
		const upTo2025 = history.slice(0, 24); // 2024-01 to 2025-12
		const values = upTo2025.map((ym) => cashOnHandTimeline(snap, [ym]).get(ym)!);
		// 2025-01 is 110,500 and 2025-12 is 120,125: (120,125 - 110,500) / 110,500
		expect(yearToDateRatio(upTo2025, values, 0)).toBeCloseTo(9625 / 110500, 10);
		expect(formatPercent(yearToDateRatio(upTo2025, values, 0))).toBe("+8.7%");
		// Data on record only from 2025-07 (115,750): (120,125 - 115,750) / 115,750
		expect(yearToDateRatio(upTo2025, values, upTo2025.indexOf("2025-07"))).toBeCloseTo(4375 / 115750, 10);
		expect(formatPercent(yearToDateRatio(upTo2025, values, upTo2025.indexOf("2025-07")))).toBe("+3.8%");
	});

	it("has no year to date when the latest year has one month, like 2026-01 here", () => {
		const values = history.map((ym) => cashOnHandTimeline(snap, [ym]).get(ym)!);
		expect(yearToDateRatio(history, values, 0)).toBeNull();
	});

	it("is n/a for the CAGR until a year of history, whatever the move", () => {
		expect(cagr(100000, 121000, 11)).toBeNull();
		expect(formatPercent(cagr(100000, 121000, 11))).toBe("n/a");
	});
});
