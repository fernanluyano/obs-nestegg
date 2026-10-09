import { describe, expect, it } from "vitest";
import { findAccount } from "../../snapshot/queries";
import { validateSnapshot } from "../../validation/validate";
import { addMortgage, loadedLedger } from "../helpers/ledgerFixture";

async function withLinkedLoan() {
	const fixture = await loadedLedger();
	await addMortgage(fixture.ledger);
	await fixture.ledger.categories.addSubcategory("Transfers", "House payment", "debt");
	await fixture.ledger.accounts.update("Mortgage", { paymentSubcategory: "House payment" });
	return fixture;
}

const link = (ledger: Awaited<ReturnType<typeof loadedLedger>>["ledger"], name = "Mortgage") =>
	findAccount(ledger.snapshot, name)!.paymentSubcategory;

describe("setPaymentAccount", () => {
	it("wires a debt payment subcategory to a loan", async () => {
		const { ledger } = await loadedLedger();
		await addMortgage(ledger);
		await ledger.accounts.setPaymentAccount("Loan payment", "Mortgage");
		expect(link(ledger)).toBe("Loan payment");
	});

	it("moves the link when another loan takes the subcategory", async () => {
		const { ledger } = await loadedLedger();
		await addMortgage(ledger);
		await addMortgage(ledger, "Car");
		await ledger.accounts.setPaymentAccount("Loan payment", "Mortgage");
		await ledger.accounts.setPaymentAccount("Loan payment", "Car");
		expect(link(ledger)).toBeUndefined();
		expect(link(ledger, "Car")).toBe("Loan payment");
	});

	it("clears the link when given no account", async () => {
		const { ledger } = await loadedLedger();
		await addMortgage(ledger);
		await ledger.accounts.setPaymentAccount("Loan payment", "Mortgage");
		await ledger.accounts.setPaymentAccount("Loan payment", undefined);
		expect(link(ledger)).toBeUndefined();
	});

	it("refuses anything but a debt payment subcategory on a loan", async () => {
		const { ledger } = await loadedLedger();
		await addMortgage(ledger);
		await expect(ledger.accounts.setPaymentAccount("Groceries", "Mortgage")).rejects.toThrow(/not a debt payment/);
		await expect(ledger.accounts.setPaymentAccount("Credit card payment", "Mortgage")).rejects.toThrow(/not a debt payment/);
		await expect(ledger.accounts.setPaymentAccount("Loan payment", "Cash Main")).rejects.toThrow(/Only a loan/);
		await expect(ledger.accounts.setPaymentAccount("Loan payment", "Card")).rejects.toThrow(/Only a loan/);
		await expect(ledger.accounts.setPaymentAccount("Loan payment", "Nope")).rejects.toThrow(/No account/);
	});
});

describe("changing a subcategory's type", () => {
	it("cuts the link when a debt payment stops being one", async () => {
		const { ledger } = await withLinkedLoan();
		await ledger.categories.setSubcategoryType("House payment", "transfer");
		expect(link(ledger)).toBeUndefined();
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});
});

describe("renaming a payment subcategory", () => {
	it("rewrites the link on the loan", async () => {
		const { ledger } = await withLinkedLoan();
		await ledger.categories.renameSubcategory("House payment", "Mortgage payment");
		expect(link(ledger)).toBe("Mortgage payment");
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("leaves loans linked to other subcategories alone", async () => {
		const { ledger } = await withLinkedLoan();
		await ledger.categories.renameSubcategory("Account transfer", "Move money");
		expect(link(ledger)).toBe("House payment");
	});

	it("follows a category rename for its Misc subcategory", async () => {
		const { ledger } = await loadedLedger();
		await addMortgage(ledger);
		await ledger.categories.setSubcategoryType("Transfers - Misc", "debt");
		await ledger.accounts.update("Mortgage", { paymentSubcategory: "Transfers - Misc" });
		await ledger.categories.renameCategory("Transfers", "Moves");
		expect(link(ledger)).toBe("Moves - Misc");
	});

	it("keeps the budget line the link feeds", async () => {
		const { ledger } = await withLinkedLoan();
		await ledger.budgets.create("2026-10");
		await ledger.budgets.setPlanned("2026-10", "House payment", 185453);
		await ledger.categories.renameSubcategory("House payment", "Mortgage payment");
		expect(ledger.snapshot.budgets[0].lines.find((l) => l.subcategory === "Mortgage payment")!.plannedCents).toBe(185453);
	});
});

describe("removing a payment subcategory or category", () => {
	it("clears the link when the subcategory is removed", async () => {
		const { ledger } = await withLinkedLoan();
		await ledger.categories.removeSubcategory("House payment");
		expect(link(ledger)).toBeUndefined();
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("clears the link when its subcategory is migrated away and removed", async () => {
		const { ledger } = await withLinkedLoan();
		await ledger.transactions.addTransfer({
			date: "2026-10-03", merchant: "", subcategory: "House payment", cents: 1000, note: "", tags: [], from: "Cash Main", to: "Mortgage",
		});
		await ledger.categories.removeSubcategory("House payment", "Loan payment");
		expect(link(ledger)).toBeUndefined();
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("clears the link when the whole category is removed", async () => {
		const { ledger } = await withLinkedLoan();
		await ledger.categories.removeCategory("Transfers");
		expect(link(ledger)).toBeUndefined();
	});
});
