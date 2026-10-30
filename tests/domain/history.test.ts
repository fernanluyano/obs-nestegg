import { describe, expect, it } from "vitest";
import { historyStats } from "../../domain/history";

const summaries = (rows: Record<string, [number, number]>) =>
	new Map(Object.entries(rows).map(([month, [incomeCents, expenseCents]]) => [month, { incomeCents, expenseCents }]));

describe("historyStats", () => {
	it("averages income, expenses and surplus over the months with data", () => {
		const stats = historyStats(
			["2026-01", "2026-02", "2026-03", "2026-04"],
			summaries({ "2026-01": [300000, 100000], "2026-02": [100000, 200000], "2026-03": [200000, 0] }),
			new Map([["2026-01", 40000], ["2026-02", 50000], ["2026-04", 99999]]),
		);
		expect(stats).toEqual({
			monthsCounted: 3,
			avgIncomeCents: 200000,
			avgExpenseCents: 100000,
			avgSurplusCents: 100000,
			expenseToIncomeRatio: 0.5,
			highestExpense: { month: "2026-02", cents: 200000 },
			avgWantCents: 30000,
		});
	});

	it("is null when no month has data", () => {
		expect(historyStats(["2026-01"], summaries({}), new Map())).toBeNull();
	});

	it("has no ratio without income and no highest month without expenses", () => {
		const onlyExpense = historyStats(["2026-01"], summaries({ "2026-01": [0, 5000] }), new Map());
		expect(onlyExpense?.expenseToIncomeRatio).toBeNull();
		const onlyIncome = historyStats(["2026-01"], summaries({ "2026-01": [5000, 0] }), new Map());
		expect(onlyIncome?.highestExpense).toBeNull();
		expect(onlyIncome?.expenseToIncomeRatio).toBe(0);
	});
});
