import { describe, expect, it } from "vitest";
import { parseBudgetNote } from "../../notes/budgetNote";
import { parseProps } from "../../notes/frontmatter";
import { planSubcategoryMigration } from "../../rename/subcategoryMigration";
import { RenameError, type PlanContext } from "../../rename/types";
import { buildSnapshot } from "../../snapshot/snapshot";
import { account, budgetInput, monthInput, tx, vaultInputs } from "../helpers/fixtures";

function context(): PlanContext {
	const inputs = [
		...vaultInputs({
			months: [
				monthInput("Cash Main", "2026-10", [tx({ subcategory: "Restaurants", amountCents: -2000 }), tx({ subcategory: "Rent", amountCents: -90000 })]),
				monthInput("Cash Main", "2026-09", [tx({ date: "2026-09-02", subcategory: "Groceries" })]),
			],
			accounts: [account()],
		}),
		budgetInput("2026-10", [{ subcategory: "Restaurants", plannedCents: 10000 }, { subcategory: "Groceries", plannedCents: 40000 }]),
		budgetInput("2026-09", [{ subcategory: "Rent", plannedCents: 1 }]),
	];
	const files = new Map(inputs.map((i) => [i.path, i.content]));
	return { snapshot: buildSnapshot(inputs), read: async (p) => files.get(p)! };
}

describe("planSubcategoryMigration", () => {
	it("rewrites only the Subcategory cell of the rows that use the removed subcategory", async () => {
		const { changes } = await planSubcategoryMigration(context(), ["Restaurants"], "Groceries");
		const month = changes.find((c) => c.fromPath.includes("Transactions/2026-10"))!;
		expect(month.toPath).toBe(month.fromPath);
		expect(month.content).toContain("| Groceries |");
		expect(month.content).not.toContain("Restaurants");
		expect(month.content).toContain("| Rent |");
		expect(parseProps(month.content)).toMatchObject({ incomeCents: 0, expenseCents: 92000 });
	});

	it("folds the budget line into the target's and leaves other budgets alone", async () => {
		const { changes } = await planSubcategoryMigration(context(), ["Restaurants"], "Groceries");
		const budget = changes.find((c) => c.fromPath.includes("Budgets"))!;
		const parsed = parseBudgetNote(parseProps(budget.content), budget.content);
		expect(parsed).toMatchObject({ lines: [{ subcategory: "Groceries", plannedCents: 50000 }] });
		expect(changes).toHaveLength(2);
	});

	it("moves several removed subcategories at once, as a category removal does", async () => {
		const { changes } = await planSubcategoryMigration(context(), ["Restaurants", "Groceries"], "Rent");
		expect(changes.map((c) => c.fromPath).sort()).toEqual([
			"Nestegg/Accounts/Cash Main/Transactions/2026-09.md",
			"Nestegg/Accounts/Cash Main/Transactions/2026-10.md",
			"Nestegg/Budgets/2026-10.md",
		]);
	});

	it("refuses an unknown subcategory", async () => {
		await expect(planSubcategoryMigration(context(), ["Nope"], "Groceries")).rejects.toThrow(RenameError);
	});

	it("refuses a target of another type, the removed one itself, a removed sibling and Credit card payment", async () => {
		await expect(planSubcategoryMigration(context(), ["Restaurants"], "Salary")).rejects.toThrow(/cannot take over/);
		await expect(planSubcategoryMigration(context(), ["Restaurants"], "Restaurants")).rejects.toThrow(/cannot take over/);
		await expect(planSubcategoryMigration(context(), ["Restaurants", "Groceries"], "Groceries")).rejects.toThrow(/cannot take over/);
		await expect(planSubcategoryMigration(context(), ["Account transfer"], "Credit card payment")).rejects.toThrow(/cannot take over/);
		await expect(planSubcategoryMigration(context(), ["Restaurants"], "Nope")).rejects.toThrow(/cannot take over/);
	});
});
