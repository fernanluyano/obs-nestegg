import { describe, expect, it } from "vitest";
import { buildCategoryIndex } from "../../domain/categories";
import { CREDIT_CARD_PAYMENT, defaultCategories } from "../../domain/defaults";
import { entryProblem, transferProblem } from "../../domain/entryRules";
import type { LedgerEntry } from "../../domain/types";
import type { TransferInput } from "../../domain/transactions";
import { account } from "../helpers/fixtures";

const ctx = {
	accounts: [account(), account({ name: "Savings" }), account({ name: "Card", accountType: "creditCard" })],
	index: buildCategoryIndex(defaultCategories()),
};

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
	account: "Cash Main", date: "2026-10-03", merchant: "", subcategory: "Groceries",
	amountCents: -500, note: "", tags: [], fromTo: "", ...over,
});

const transfer = (over: Partial<TransferInput> = {}): TransferInput => ({
	date: "2026-10-03", merchant: "", subcategory: "Account transfer", cents: 500,
	note: "", tags: [], from: "Cash Main", to: "Savings", ...over,
});

describe("entryProblem", () => {
	it("accepts expense and income rows", () => {
		expect(entryProblem(entry(), ctx)).toBeNull();
		expect(entryProblem(entry({ subcategory: "Salary", amountCents: 100 }), ctx)).toBeNull();
		expect(entryProblem(entry({ amountCents: 500 }), ctx)).toBeNull();
	});

	it.each([
		[{ date: "10/03" }, "invalidDate"],
		[{ amountCents: 1.5 }, "invalidAmount"],
		[{ account: "Nope" }, "unknownAccount"],
		[{ subcategory: "Nope" }, "unknownSubcategory"],
		[{ subcategory: "Account transfer" }, "subcategoryIsTransfer"],
		[{ fromTo: "Savings" }, "unexpectedFromTo"],
	] as const)("rejects %j as %s", (over, problem) => {
		expect(entryProblem(entry(over), ctx)).toBe(problem);
	});
});

describe("transferProblem", () => {
	it("accepts a plain transfer and a card payment", () => {
		expect(transferProblem(transfer(), ctx)).toBeNull();
		expect(transferProblem(transfer({ subcategory: CREDIT_CARD_PAYMENT, to: "Card" }), ctx)).toBeNull();
	});

	it.each([
		[{ date: "nope" }, "invalidDate"],
		[{ cents: 1.5 }, "invalidAmount"],
		[{ cents: 0 }, "amountNotPositive"],
		[{ cents: -5 }, "amountNotPositive"],
		[{ from: "Nope" }, "unknownAccount"],
		[{ to: "Nope" }, "unknownAccount"],
		[{ subcategory: "Nope" }, "unknownSubcategory"],
		[{ subcategory: "Groceries" }, "subcategoryNotTransfer"],
		[{ to: "Cash Main" }, "sameAccount"],
		[{ subcategory: CREDIT_CARD_PAYMENT, from: "Card", to: "Savings" }, "fromMustNotBeCreditCard"],
		[{ subcategory: CREDIT_CARD_PAYMENT, to: "Savings" }, "toMustBeCreditCard"],
	] as const)("rejects %j as %s", (over, problem) => {
		expect(transferProblem(transfer(over), ctx)).toBe(problem);
	});
});
