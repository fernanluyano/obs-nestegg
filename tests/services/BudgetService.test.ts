import { describe, expect, it } from "vitest";
import { parseBudgetNote } from "../../notes/budgetNote";
import { parseProps } from "../../notes/frontmatter";
import { budgetPath } from "../../notes/paths";
import { isEmptyVault } from "../../services/seed";
import { LedgerError } from "../../services/errors";
import { budgetInput, vaultInputs } from "../helpers/fixtures";
import { addMortgage, loadedLedger } from "../helpers/ledgerFixture";

const planned = (ledger: Awaited<ReturnType<typeof loadedLedger>>["ledger"], month: string, subcategory: string) =>
	ledger.snapshot.budgets.find((b) => b.month === month)?.lines.find((l) => l.subcategory === subcategory)?.plannedCents;

describe("create", () => {
	it("seeds a first budget with a zero line per expense and income subcategory", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.budgets.create("2026-10");
		const parsed = parseBudgetNote(parseProps(vault.files.get(budgetPath("2026-10"))!), vault.files.get(budgetPath("2026-10"))!);
		expect(parsed).toMatchObject({ ok: true, month: "2026-10" });
		expect(planned(ledger, "2026-10", "Groceries")).toBe(0);
		expect(planned(ledger, "2026-10", "Salary")).toBe(0);
		expect(planned(ledger, "2026-10", "Account transfer")).toBeUndefined();
	});

	it("copies the plan of the most recent earlier month, not later ones", async () => {
		const { ledger } = await loadedLedger([
			...vaultInputs({ months: [] }),
			budgetInput("2026-07", [{ subcategory: "Groceries", plannedCents: 11111 }]),
			budgetInput("2026-08", [{ subcategory: "Groceries", plannedCents: 40000 }]),
			budgetInput("2026-12", [{ subcategory: "Groceries", plannedCents: 99999 }]),
		]);
		await ledger.budgets.create("2026-10");
		expect(planned(ledger, "2026-10", "Groceries")).toBe(40000);
		expect(planned(ledger, "2026-10", "Rent")).toBe(0);
	});

	it("leaves an existing budget alone", async () => {
		const { ledger } = await loadedLedger([...vaultInputs({ months: [] }), budgetInput("2026-10", [{ subcategory: "Groceries", plannedCents: 5 }])]);
		await ledger.budgets.create("2026-10");
		expect(planned(ledger, "2026-10", "Groceries")).toBe(5);
		expect(planned(ledger, "2026-10", "Rent")).toBeUndefined();
	});

	it("rejects something that is not a month", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.budgets.create("October")).rejects.toThrow(LedgerError);
	});
});

describe("setPlanned", () => {
	it("writes the amount to the month's note and reloads", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.budgets.create("2026-10");
		await ledger.budgets.setPlanned("2026-10", "Groceries", 45000);
		expect(planned(ledger, "2026-10", "Groceries")).toBe(45000);
		expect(vault.files.get(budgetPath("2026-10"))).toContain("| Groceries | 45000 |");
	});

	it("adds a line for a subcategory created after the budget", async () => {
		const { ledger } = await loadedLedger();
		await ledger.budgets.create("2026-10");
		await ledger.categories.addSubcategory("Food", "Coffee", "expense");
		await ledger.budgets.setPlanned("2026-10", "Coffee", 2000);
		expect(planned(ledger, "2026-10", "Coffee")).toBe(2000);
	});

	it("plans a debt payment only once a loan names it", async () => {
		const { ledger } = await loadedLedger();
		await addMortgage(ledger);
		await ledger.budgets.create("2026-10");
		await expect(ledger.budgets.setPlanned("2026-10", "Loan payment", 5000)).rejects.toThrow(/payment category/);
		await ledger.accounts.update("Mortgage", { paymentSubcategory: "Loan payment" });
		await ledger.budgets.setPlanned("2026-10", "Loan payment", 185453);
		expect(planned(ledger, "2026-10", "Loan payment")).toBe(185453);
	});

	it("seeds a new month with the linked payment lines", async () => {
		const { ledger } = await loadedLedger();
		await addMortgage(ledger);
		await ledger.accounts.update("Mortgage", { paymentSubcategory: "Loan payment" });
		await ledger.budgets.create("2026-10");
		await ledger.budgets.setPlanned("2026-10", "Loan payment", 185453);
		await ledger.budgets.create("2026-11");
		const lines = ledger.snapshot.budgets.find((b) => b.month === "2026-11")!.lines.map((l) => l.subcategory);
		expect(planned(ledger, "2026-11", "Loan payment")).toBe(185453);
		expect(lines).not.toContain("Account transfer");
		expect(lines).not.toContain("Credit card payment");
	});

	it("never plans a transfer, not even a card payment", async () => {
		const { ledger } = await loadedLedger();
		await ledger.budgets.create("2026-10");
		await expect(ledger.budgets.setPlanned("2026-10", "Account transfer", 1)).rejects.toThrow(/transfer is not budgeted/);
		await expect(ledger.budgets.setPlanned("2026-10", "Credit card payment", 1)).rejects.toThrow(/transfer is not budgeted/);
	});

	it("rejects a missing budget, unknown subcategories, unlinked debt payments and bad amounts", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.budgets.setPlanned("2026-10", "Groceries", 1)).rejects.toThrow(/no budget for 2026-10/);
		await ledger.budgets.create("2026-10");
		await expect(ledger.budgets.setPlanned("2026-10", "Nope", 1)).rejects.toThrow(/No subcategory/);
		await expect(ledger.budgets.setPlanned("2026-10", "Loan payment", 1)).rejects.toThrow(/payment category/);
		await expect(ledger.budgets.setPlanned("2026-10", "Groceries", -1)).rejects.toThrow(/zero or more/);
	});
});

describe("category changes reach the budgets", () => {
	async function withBudgets() {
		const fixture = await loadedLedger();
		await fixture.ledger.budgets.create("2026-09");
		await fixture.ledger.budgets.create("2026-10");
		await fixture.ledger.budgets.setPlanned("2026-09", "Restaurants", 7000);
		await fixture.ledger.budgets.setPlanned("2026-10", "Restaurants", 8000);
		return fixture;
	}

	it("renaming a subcategory renames its line in every month", async () => {
		const { ledger } = await withBudgets();
		await ledger.categories.renameSubcategory("Restaurants", "Dining out");
		expect(planned(ledger, "2026-09", "Dining out")).toBe(7000);
		expect(planned(ledger, "2026-10", "Dining out")).toBe(8000);
		expect(planned(ledger, "2026-10", "Restaurants")).toBeUndefined();
	});

	it("renaming a category carries its Misc line along", async () => {
		const { ledger } = await withBudgets();
		await ledger.budgets.setPlanned("2026-10", "Food - Misc", 900);
		await ledger.categories.renameCategory("Food", "Eating");
		expect(planned(ledger, "2026-10", "Eating - Misc")).toBe(900);
		expect(planned(ledger, "2026-10", "Restaurants")).toBe(8000);
	});

	it("removing a subcategory drops its line from every month", async () => {
		const { ledger } = await withBudgets();
		await ledger.categories.removeSubcategory("Restaurants");
		expect(planned(ledger, "2026-09", "Restaurants")).toBeUndefined();
		expect(planned(ledger, "2026-10", "Restaurants")).toBeUndefined();
		expect(planned(ledger, "2026-10", "Groceries")).toBe(0);
	});

	it("removing a category drops the lines of all its subcategories", async () => {
		const { ledger } = await withBudgets();
		await ledger.categories.removeCategory("Food");
		const left = ledger.snapshot.budgets.flatMap((b) => b.lines.map((l) => l.subcategory));
		expect(left.some((s) => s === "Groceries" || s === "Restaurants" || s === "Food - Misc")).toBe(false);
		expect(left).toContain("Rent");
	});

	it("leaves months whose budget never mentioned the subcategory untouched", async () => {
		const { ledger, vault } = await loadedLedger([...vaultInputs({ months: [] }), budgetInput("2026-10", [{ subcategory: "Rent", plannedCents: 1 }])]);
		const before = vault.files.get(budgetPath("2026-10"));
		await ledger.categories.removeSubcategory("Tolls");
		expect(vault.files.get(budgetPath("2026-10"))).toBe(before);
	});
});

describe("isEmptyVault", () => {
	it("is not empty once a budget exists", async () => {
		const { ledger } = await loadedLedger([budgetInput("2026-10", [])]);
		expect(isEmptyVault(ledger.snapshot)).toBe(false);
	});
});
