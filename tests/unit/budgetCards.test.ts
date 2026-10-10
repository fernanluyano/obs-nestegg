import { describe, expect, it } from "vitest";
import type { BudgetSummary } from "../../domain/budget";
import { budgetCards, metricText } from "../../view/budgetCards";

// August 2026: Yoni's vet bills are the whole unbudgeted amount
const august: BudgetSummary = {
	incomePlannedCents: 1005434,
	incomeActualCents: 1005434,
	expensePlannedCents: 1131846,
	expenseActualCents: 1538391,
	expenseLeftCents: 1131846 - 1538391,
	unbudgetedCents: 495729,
	surplusCents: 1005434 - 1538391,
};

const shown = (summary: BudgetSummary) => budgetCards(summary).map((c) => [c.label, metricText(c.valueCents, c.variant, c.signed), c.hint]);

describe("metricText", () => {
	it("keeps the minus of a negative result and the plus of a positive one when signed", () => {
		expect(metricText(-532957, "negative", true)).toBe("-5,329.57");
		expect(metricText(532957, "positive", true)).toBe("+5,329.57");
	});

	it("drops the sign when not signed and never signs neutral", () => {
		expect(metricText(1538391, "expense", false)).toBe("15,383.91");
		expect(metricText(1000, "neutral", true)).toBe("10.00");
	});
});

describe("budgetCards", () => {
	it("shows four cards, each saying what its number is", () => {
		expect(shown(august)).toEqual([
			["Income", "10,054.34", "received of 10,054.34 planned"],
			["Spending", "15,383.91", "spent of 11,318.46 planned (no income)"],
			["Unbudgeted", "4,957.29", "part of the spending, on items with no planned amount"],
			["Surplus", "-5,329.57", "income received minus all spending"],
		]);
	});

	it("shows spending as all money out, so the unbudgeted part is inside it", () => {
		const [, spending, unbudgeted] = budgetCards(august);
		expect(spending.valueCents).toBe(august.expenseActualCents);
		expect(unbudgeted.valueCents).toBeLessThanOrEqual(spending.valueCents);
	});

	it("shows surplus as income minus spending and signs it positive when there is money left", () => {
		const surplus = budgetCards({ ...august, incomeActualCents: 2000000, surplusCents: 2000000 - 1538391 })[3];
		expect(metricText(surplus.valueCents, surplus.variant, surplus.signed)).toBe("+4,616.09");
		expect(surplus.variant).toBe("positive");
	});
});
