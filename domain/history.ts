import type { MonthSummary } from "./types";

export interface HistoryStats {
	monthsCounted: number;
	avgIncomeCents: number;
	avgExpenseCents: number;
	avgSurplusCents: number;
	// Expenses over income across the counted months; null without income, where a ratio says nothing.
	expenseToIncomeRatio: number | null;
	highestExpense: { month: string; cents: number } | null;
	avgWantCents: number;
}

// Months with neither income nor expense are before the user started tracking, so counting them
// would drag every average down. Null when no month has data.
// `wantByMonth` is each month's spending on entries tagged "want".
export function historyStats(
	months: string[],
	summaries: Map<string, MonthSummary>,
	wantByMonth: Map<string, number>,
): HistoryStats | null {
	const counted = months
		.map((month) => ({ month, ...(summaries.get(month) ?? { incomeCents: 0, expenseCents: 0 }) }))
		.filter((m) => m.incomeCents !== 0 || m.expenseCents !== 0);
	if (counted.length === 0) return null;

	const income = counted.reduce((sum, m) => sum + m.incomeCents, 0);
	const expense = counted.reduce((sum, m) => sum + m.expenseCents, 0);
	const want = counted.reduce((sum, m) => sum + (wantByMonth.get(m.month) ?? 0), 0);
	const highest =counted.reduce((best, m) => (m.expenseCents > best.expenseCents ? m : best));

	return {
		monthsCounted: counted.length,
		avgIncomeCents: Math.round(income / counted.length),
		avgExpenseCents: Math.round(expense / counted.length),
		avgSurplusCents: Math.round((income - expense) / counted.length),
		expenseToIncomeRatio: income > 0 ? expense / income : null,
		highestExpense: highest.expenseCents > 0 ? { month: highest.month, cents: highest.expenseCents } : null,
		avgWantCents: Math.round(want / counted.length),
	};
}
