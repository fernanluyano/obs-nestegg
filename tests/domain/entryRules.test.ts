import { describe, expect, it } from "vitest";
import { buildCategoryIndex } from "../../domain/categories";
import { CREDIT_CARD_PAYMENT, defaultCategories, LOAN_PAYMENT } from "../../domain/defaults";
import { entryProblem, transferProblem } from "../../domain/entryRules";
import type { LedgerEntry } from "../../domain/types";
import type { TransferInput } from "../../domain/transactions";
import { account } from "../helpers/fixtures";

const ctx = {
	accounts: [
		account(),
		account({ name: "Savings" }),
		account({ name: "Card", accountType: "creditCard" }),
		account({ name: "Mortgage", accountType: "loan", loanKind: "mortgage" }),
		account({ name: "Brokerage", accountType: "investing" }),
	],
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

describe("investing accounts", () => {
	it("take no rows, no transfers in and no transfers out", () => {
		expect(entryProblem(entry({ account: "Brokerage" }), ctx)).toBe("investingNoTransactions");
		expect(transferProblem(transfer({ to: "Brokerage" }), ctx)).toBe("investingNoTransactions");
		expect(transferProblem(transfer({ from: "Brokerage", to: "Savings" }), ctx)).toBe("investingNoTransactions");
	});
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
		[{ subcategory: LOAN_PAYMENT }, "subcategoryIsTransfer"],
		[{ fromTo: "Savings" }, "unexpectedFromTo"],
		[{ account: "Mortgage", amountCents: -500 }, "loanTransfersOnly"],
		[{ account: "Mortgage", subcategory: "Salary", amountCents: 500 }, "loanTransfersOnly"],
	] as const)("rejects %j as %s", (over, problem) => {
		expect(entryProblem(entry(over), ctx)).toBe(problem);
	});

	it("still accepts spending on a credit card", () => {
		expect(entryProblem(entry({ account: "Card" }), ctx)).toBeNull();
	});
});

describe("transferProblem", () => {
	it.each([
		["a transfer from cash to cash", { to: "Savings" }],
		["a transfer from cash to a credit card", { to: "Card" }],
		["a card payment from cash to a card", { subcategory: CREDIT_CARD_PAYMENT, to: "Card" }],
		["a debt payment from cash to a loan", { subcategory: LOAN_PAYMENT, to: "Mortgage" }],
	])("accepts %s", (_, over) => {
		expect(transferProblem(transfer(over), ctx)).toBeNull();
	});

	it("keeps a transfer off a loan and a debt payment off everything but a loan", () => {
		expect(transferProblem(transfer({ to: "Mortgage" }), ctx)).toBe("transferToLoan");
		expect(transferProblem(transfer({ subcategory: CREDIT_CARD_PAYMENT, to: "Mortgage" }), ctx)).toBe("transferToLoan");
		expect(transferProblem(transfer({ subcategory: LOAN_PAYMENT, to: "Savings" }), ctx)).toBe("debtToNonLoan");
		expect(transferProblem(transfer({ subcategory: LOAN_PAYMENT, to: "Card" }), ctx)).toBe("debtToNonLoan");
	});

	it("accepts interest on a loan payment, zero or more, and nowhere else", () => {
		const payment = { subcategory: LOAN_PAYMENT, to: "Mortgage" };
		expect(transferProblem(transfer({ ...payment, interestCents: 14374 }), ctx)).toBeNull();
		expect(transferProblem(transfer({ ...payment, interestCents: 0 }), ctx)).toBeNull();
		expect(transferProblem(transfer({ ...payment, interestCents: -1 }), ctx)).toBe("invalidInterest");
		expect(transferProblem(transfer({ ...payment, interestCents: 1.5 }), ctx)).toBe("invalidInterest");
		expect(transferProblem(transfer({ to: "Savings", interestCents: 100 }), ctx)).toBe("interestOnNonLoan");
		expect(transferProblem(transfer({ to: "Savings", interestCents: 0 }), ctx)).toBeNull();
	});

	it("keeps a debt payment on the loan its subcategory is linked to", () => {
		const accounts = [...ctx.accounts, account({ name: "Car", accountType: "loan", loanKind: "car", paymentSubcategory: LOAN_PAYMENT })];
		const linked = { ...ctx, accounts };
		expect(transferProblem(transfer({ subcategory: LOAN_PAYMENT, to: "Car" }), linked)).toBeNull();
		expect(transferProblem(transfer({ subcategory: LOAN_PAYMENT, to: "Mortgage" }), linked)).toBe("wrongDebtAccount");
	});

	it.each([
		["card to cash", "Card", "Savings"],
		["card to card", "Card", "Card2"],
		["card to loan", "Card", "Mortgage"],
		["loan to cash", "Mortgage", "Savings"],
		["loan to card", "Mortgage", "Card"],
	])("rejects %s whatever the subcategory", (_, from, to) => {
		const accounts = [...ctx.accounts, account({ name: "Card2", accountType: "creditCard" })];
		for (const subcategory of ["Account transfer", CREDIT_CARD_PAYMENT, LOAN_PAYMENT]) {
			expect(transferProblem(transfer({ from, to, subcategory }), { ...ctx, accounts })).toBe("fromMustBeCash");
		}
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
	] as const)("rejects %j as %s", (over, problem) => {
		expect(transferProblem(transfer(over), ctx)).toBe(problem);
	});
});
