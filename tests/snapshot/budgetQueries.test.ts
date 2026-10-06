import { describe, expect, it } from "vitest";
import { budgetSheetOf, findBudget, previousBudget } from "../../snapshot/budgetQueries";
import { buildSnapshot } from "../../snapshot/snapshot";
import { budgetInput, inputOf, monthInput, tx, vaultInputs } from "../helpers/fixtures";

const snap = buildSnapshot([
	...vaultInputs({ months: [monthInput("Cash Main", "2026-10", [tx({ amountCents: -45000 }), tx({ subcategory: "Salary", amountCents: 250000 })])] }),
	budgetInput("2026-08", [{ subcategory: "Groceries", plannedCents: 10000 }]),
	budgetInput("2026-09", [{ subcategory: "Groceries", plannedCents: 30000 }]),
	budgetInput("2026-10", [{ subcategory: "Groceries", plannedCents: 40000 }, { subcategory: "Salary", plannedCents: 300000 }]),
]);

describe("findBudget / previousBudget", () => {
	it("finds a month's budget", () => {
		expect(findBudget(snap, "2026-09")?.lines).toEqual([{ subcategory: "Groceries", plannedCents: 30000 }]);
		expect(findBudget(snap, "2026-11")).toBeUndefined();
	});

	it("takes the latest budget strictly before the month, even across a gap", () => {
		expect(previousBudget(snap, "2026-10")?.month).toBe("2026-09");
		expect(previousBudget(snap, "2027-03")?.month).toBe("2026-10");
		expect(previousBudget(snap, "2026-08")).toBeUndefined();
	});

	it("does not depend on the order budgets were loaded in", () => {
		const reversed = { ...snap, budgets: [...snap.budgets].reverse() };
		expect(previousBudget(reversed, "2026-10")?.month).toBe("2026-09");
	});
});

describe("budgetSheetOf", () => {
	it("sets the month's plan against that month's transactions", () => {
		const sheet = budgetSheetOf(snap, "2026-10");
		const groceries = sheet.expense.flatMap((s) => s.rows).find((r) => r.subcategory === "Groceries")!;
		expect(groceries).toMatchObject({ plannedCents: 40000, actualCents: 45000 });
		expect(groceries.progress.state).toBe("over");
		expect(sheet.summary.surplusCents).toBe(205000);
	});

	it("shows zero plans for a month with no budget but still counts its spending", () => {
		const sheet = budgetSheetOf(snap, "2026-09");
		expect(sheet.summary).toMatchObject({ expensePlannedCents: 30000, expenseActualCents: 0 });
		const none = budgetSheetOf(buildSnapshot(vaultInputs()), "2026-10");
		expect(none.summary).toMatchObject({ expensePlannedCents: 0, expenseActualCents: 8450 });
	});

	it("keeps a budget note with no valid month out of the data", () => {
		const bad = buildSnapshot([inputOf("Nestegg/Budgets/x.md", "---\ntags: [nestegg/budget]\nstate: current\nmonth: soon\n---\n")]);
		expect(bad.budgets).toEqual([]);
		expect(bad.invalid).toEqual([{ path: "Nestegg/Budgets/x.md", kind: "budget", reason: "month must be YYYY-MM" }]);
	});
});
