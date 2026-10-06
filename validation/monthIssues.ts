import { summarize } from "../domain/transactions";
import type { CategoryIndex } from "../domain/categories";
import type { Snapshot } from "../snapshot/snapshot";
import type { DuplicateMonthIssue, MalformedRowIssue, MonthTotalsIssue } from "./issues";

export function detectMonthTotals(snapshot: Snapshot, index: CategoryIndex): MonthTotalsIssue[] {
	const issues: MonthTotalsIssue[] = [];
	for (const m of snapshot.months) {
		const actual = summarize(m.transactions, index);
		if (m.stored.incomeCents === actual.incomeCents && m.stored.expenseCents === actual.expenseCents) continue;
		issues.push({ type: "monthTotals", path: m.path, account: m.account, month: m.month, stored: m.stored, actual });
	}
	return issues;
}

export function detectMalformedRows(snapshot: Snapshot): MalformedRowIssue[] {
	const fromMonths = snapshot.months.flatMap((m) =>
		m.rowIssues.map((i): MalformedRowIssue => ({ type: "malformedRow", path: m.path, ...i })),
	);
	const fromCategories = snapshot.categories.flatMap((c) =>
		c.tableIssues.map((i): MalformedRowIssue => ({ type: "malformedRow", path: c.path, ...i })),
	);
	const fromBudgets = snapshot.budgets.flatMap((b) =>
		b.rowIssues.map((i): MalformedRowIssue => ({ type: "malformedRow", path: b.path, ...i })),
	);
	return [...fromMonths, ...fromCategories, ...fromBudgets];
}

export function detectDuplicateMonths(snapshot: Snapshot): DuplicateMonthIssue[] {
	const paths = new Map<string, { account: string; month: string; paths: string[] }>();
	for (const m of snapshot.months) {
		const key = `${m.account}\u0000${m.month}`;
		const entry = paths.get(key) ?? { account: m.account, month: m.month, paths: [] };
		entry.paths.push(m.path);
		paths.set(key, entry);
	}
	return [...paths.values()]
		.filter((e) => e.paths.length > 1)
		.map((e) => ({ type: "duplicateMonth", ...e }));
}
