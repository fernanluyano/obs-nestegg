import { describe, expect, it } from "vitest";
import { bulkReassignProblem, bulkReassignTargets } from "../../domain/bulkEdit";
import { defaultCategories } from "../../domain/defaults";
import type { LedgerEntry } from "../../domain/types";
import { index, tx } from "../helpers/fixtures";

const categories = defaultCategories();
const row = (subcategory: string, amountCents = -100): LedgerEntry => ({ ...tx({ subcategory, amountCents }), account: "Cash Main" });

describe("bulkReassignTargets", () => {
	it("offers every subcategory of the shared type", () => {
		const result = bulkReassignTargets([row("Groceries"), row("Rent")], categories, index);
		expect(result.ok && result.targets.map((o) => o.subcategory)).toContain("Restaurants");
		expect(result.ok && result.targets.every((o) => ["Food", "Housing", "Transportation", "Subscriptions", "Shopping", "Medical", "Insurance", "Lifestyle", "Giving"].includes(o.category))).toBe(true);
	});

	it("treats refunds as expenses and offers income subcategories for income rows", () => {
		expect(bulkReassignTargets([row("Groceries", 500)], categories, index)).toMatchObject({ ok: true });
		const income = bulkReassignTargets([row("Salary", 100000)], categories, index);
		expect(income.ok && income.targets.map((o) => o.subcategory)).toEqual(["Salary", "Interest", "Income - Misc"]);
	});

	it("says why a selection cannot be reassigned", () => {
		expect(bulkReassignTargets([], categories, index)).toEqual({ ok: false, problem: "empty" });
		expect(bulkReassignTargets([row("Groceries"), row("Salary", 1)], categories, index)).toEqual({ ok: false, problem: "mixed" });
		expect(bulkReassignTargets([row("Groceries"), row("Account transfer")], categories, index)).toEqual({ ok: false, problem: "transfer" });
		expect(bulkReassignTargets([row("Groceries"), row("Gone")], categories, index)).toEqual({ ok: false, problem: "unknown" });
	});
});

describe("bulkReassignProblem", () => {
	it("accepts a target of the same type", () => {
		expect(bulkReassignProblem([row("Groceries")], "Rent", categories, index)).toBeNull();
	});

	it("refuses a target of another type or one that does not exist", () => {
		expect(bulkReassignProblem([row("Groceries")], "Salary", categories, index)).toBe("badTarget");
		expect(bulkReassignProblem([row("Groceries")], "Nope", categories, index)).toBe("badTarget");
	});

	it("reports the selection's own problem first", () => {
		expect(bulkReassignProblem([], "Rent", categories, index)).toBe("empty");
		expect(bulkReassignProblem([row("Account transfer")], "Rent", categories, index)).toBe("transfer");
	});
});
