import { describe, expect, it } from "vitest";
import { buildCategoryIndex } from "../../domain/categories";
import { defaultCategories } from "../../domain/defaults";
import {
	findTransactionIndex,
	interestOf,
	isPartnerRow,
	sameLoanLeg,
	sameTransaction,
	signedAmount,
	splitAmount,
	stripInterestNote,
	summarize,
	transferEntries,
	typeOf,
} from "../../domain/transactions";
import type { Transaction } from "../../domain/types";

const index = buildCategoryIndex(defaultCategories());

const tx = (over: Partial<Transaction> = {}): Transaction => ({
	date: "2026-10-01",
	merchant: "Publix",
	subcategory: "Groceries",
	amountCents: -8450,
	note: "",
	tags: [],
	fromTo: "",
	...over,
});

describe("typeOf", () => {
	it("reads the type from the subcategory's category", () => {
		expect(typeOf(tx(), index)).toBe("expense");
		expect(typeOf(tx({ subcategory: "Salary" }), index)).toBe("income");
		expect(typeOf(tx({ subcategory: "Account transfer" }), index)).toBe("transfer");
		expect(typeOf(tx({ subcategory: "Nope" }), index)).toBeUndefined();
	});
});

describe("summarize with debt payments", () => {
	it("counts a debt payment as spending once, through its outgoing row", () => {
		const out = tx({ subcategory: "Loan payment", amountCents: -185453, fromTo: "House" });
		const landing = tx({ subcategory: "Loan payment", amountCents: 185453, fromTo: "Cash Main" });
		expect(summarize([out], index)).toEqual({ incomeCents: 0, expenseCents: 185453 });
		expect(summarize([landing], index)).toEqual({ incomeCents: 0, expenseCents: 0 });
		expect(summarize([out, landing, tx({ amountCents: -1000 })], index)).toEqual({ incomeCents: 0, expenseCents: 186453 });
	});

	it("still leaves plain transfers out", () => {
		const rows = [tx({ subcategory: "Account transfer", amountCents: -5000, fromTo: "Savings" }), tx({ subcategory: "Credit card payment", amountCents: -4000, fromTo: "Card" })];
		expect(summarize(rows, index)).toEqual({ incomeCents: 0, expenseCents: 0 });
	});
});

describe("summarize", () => {
	it("sums income and negates expenses, netting refunds", () => {
		const rows = [
			tx({ amountCents: -8450 }),
			tx({ subcategory: "Salary", amountCents: 250000 }),
			tx({ amountCents: 1200 }),
			tx({ subcategory: "Nope", amountCents: -15000 }),
			tx({ subcategory: "Gift", amountCents: -15000 }),
		];
		expect(summarize(rows, index)).toEqual({ incomeCents: 250000, expenseCents: 7250 });
	});

	it("ignores transfers and unknown subcategories", () => {
		const rows = [tx({ subcategory: "Account transfer", amountCents: -50000, fromTo: "Savings" }), tx({ subcategory: "???" })];
		expect(summarize(rows, index)).toEqual({ incomeCents: 0, expenseCents: 0 });
	});

	it("is zero for no rows", () => {
		expect(summarize([], index)).toEqual({ incomeCents: 0, expenseCents: 0 });
	});
});

describe("sameTransaction / findTransactionIndex", () => {
	it("compares every field including tag order", () => {
		expect(sameTransaction(tx(), tx())).toBe(true);
		for (const over of [
			{ date: "2026-10-02" }, { merchant: "x" }, { subcategory: "x" }, { amountCents: 1 },
			{ note: "x" }, { fromTo: "x" }, { tags: ["x"] },
		]) {
			expect(sameTransaction(tx(), tx(over))).toBe(false);
		}
		expect(sameTransaction(tx({ tags: ["a", "b"] }), tx({ tags: ["b", "a"] }))).toBe(false);
	});

	it("finds the first matching row or -1", () => {
		const rows = [tx({ note: "a" }), tx({ note: "b" }), tx({ note: "b" })];
		expect(findTransactionIndex(rows, tx({ note: "b" }))).toBe(1);
		expect(findTransactionIndex(rows, tx({ note: "z" }))).toBe(-1);
	});
});

describe("signedAmount / splitAmount", () => {
	it("stores expenses negative and income positive", () => {
		expect(signedAmount("expense", 500, false)).toBe(-500);
		expect(signedAmount("income", 500, false)).toBe(500);
	});

	it("never produces negative zero", () => {
		expect(Object.is(signedAmount("expense", 0, false), 0)).toBe(true);
	});

	it("stores a refund as positive under an expense", () => {
		expect(signedAmount("expense", 500, true)).toBe(500);
	});

	it("splits a stored amount back into form values", () => {
		expect(splitAmount("expense", -500)).toEqual({ cents: 500, isRefund: false });
		expect(splitAmount("expense", 500)).toEqual({ cents: 500, isRefund: true });
		expect(splitAmount("income", 500)).toEqual({ cents: 500, isRefund: false });
		expect(splitAmount("transfer", -500)).toEqual({ cents: 500, isRefund: false });
	});
});

// A real car loan payment: $763.48 left the cash account, of which $143.74 was interest, so the
// loan went down by the $619.74 principal only.
describe("a loan payment with interest", () => {
	const input = {
		date: "2026-08-03", merchant: "CCU FL", subcategory: "Ioniq Loan",
		cents: 61974, interestCents: 14374, note: "", tags: ["need"], from: "Fidelity", to: "Ioniq 5",
	};

	it("takes principal plus interest out of the cash account and puts only the principal on the loan", () => {
		const [cash, loan] = transferEntries(input);
		expect(cash).toMatchObject({ account: "Fidelity", amountCents: -76348, fromTo: "Ioniq 5" });
		expect(loan).toMatchObject({ account: "Ioniq 5", amountCents: 61974, fromTo: "Fidelity" });
		expect(interestOf(cash, loan)).toBe(14374);
	});

	it("notes the interest on the loan row only, after the user's own note", () => {
		const [cash, loan] = transferEntries(input);
		expect(cash.note).toBe("");
		expect(loan.note).toBe("does not include the interest amount of 143.74, principal only");
		const [, withNote] = transferEntries({ ...input, note: "autopay" });
		expect(withNote.note).toBe("autopay; does not include the interest amount of 143.74, principal only");
	});

	it("takes the automatic note back off, and only that note", () => {
		const [, loan] = transferEntries({ ...input, note: "autopay" });
		expect(stripInterestNote(loan.note)).toBe("autopay");
		expect(stripInterestNote(transferEntries(input)[1].note)).toBe("");
		expect(stripInterestNote("does not include the interest amount of 1,143.74, principal only")).toBe("");
		expect(stripInterestNote("my own words")).toBe("my own words");
		expect(stripInterestNote("interest amount of 1.00 is in here")).toBe("interest amount of 1.00 is in here");
	});

	it("writes equal opposite rows and no note when there is no interest", () => {
		const [cash, loan] = transferEntries({ ...input, interestCents: 0, note: "x" });
		expect(cash.amountCents).toBe(-61974);
		expect(loan.amountCents).toBe(61974);
		expect(loan.note).toBe("x");
		expect(transferEntries({ ...input, interestCents: undefined })[0].amountCents).toBe(-61974);
	});

	it("pairs by date and merchant when the amounts differ, from either row", () => {
		const [cash, loan] = transferEntries(input);
		expect(isPartnerRow(cash, loan, true)).toBe(true);
		expect(isPartnerRow(loan, cash, true)).toBe(true);
		expect(isPartnerRow(cash, loan)).toBe(false); // a plain transfer still needs exact opposites
	});

	it("rejects a loan row that is not this payment's", () => {
		const [cash, loan] = transferEntries(input);
		expect(isPartnerRow(cash, { ...loan, merchant: "Other" }, true)).toBe(false);
		expect(isPartnerRow(cash, { ...loan, date: "2026-08-04" }, true)).toBe(false);
		expect(isPartnerRow(cash, { ...loan, subcategory: "Other" }, true)).toBe(false);
		expect(isPartnerRow(cash, { ...loan, fromTo: "Nobody" }, true)).toBe(false);
		expect(isPartnerRow(cash, { ...loan, account: "Nobody" }, true)).toBe(false);
	});

	it("rejects a loan row bigger than what left the cash account, or with the wrong sign", () => {
		const [cash, loan] = transferEntries(input);
		expect(isPartnerRow(cash, { ...loan, amountCents: 76349 }, true)).toBe(false);
		expect(isPartnerRow(cash, { ...loan, amountCents: 76348 }, true)).toBe(true); // no interest
		expect(isPartnerRow(cash, { ...loan, amountCents: -61974 }, true)).toBe(false);
		expect(isPartnerRow(cash, { ...loan, amountCents: 0 }, true)).toBe(false);
	});

	it("tells two payments on the same side apart only by their place in the file", () => {
		const [cash, loan] = transferEntries(input);
		expect(sameLoanLeg(cash, { ...cash, amountCents: -1000 })).toBe(true);
		expect(sameLoanLeg(cash, loan)).toBe(false);
		expect(sameLoanLeg(cash, { ...cash, date: "2026-08-04" })).toBe(false);
		expect(sameLoanLeg(cash, { ...cash, merchant: "Other" })).toBe(false);
		expect(sameLoanLeg(cash, { ...cash, account: "Other" })).toBe(false);
	});
});

describe("transferEntries / isPartnerRow", () => {
	const input = {
		date: "2026-10-05", merchant: "", subcategory: "Account transfer",
		cents: 50000, note: "move", tags: ["x"], from: "Cash", to: "Savings",
	};

	it("builds a negative row on the sender and a positive row on the receiver", () => {
		const [out, inn] = transferEntries(input);
		expect(out).toMatchObject({ account: "Cash", amountCents: -50000, fromTo: "Savings" });
		expect(inn).toMatchObject({ account: "Savings", amountCents: 50000, fromTo: "Cash" });
		expect(out.note).toBe("move");
		expect(inn.tags).toEqual(["x"]);
	});

	it("recognizes the partner row and rejects near misses", () => {
		const [out, inn] = transferEntries(input);
		expect(isPartnerRow(out, inn)).toBe(true);
		expect(isPartnerRow(inn, out)).toBe(true);
		expect(isPartnerRow(out, { ...inn, amountCents: 40000 })).toBe(false);
		expect(isPartnerRow(out, { ...inn, date: "2026-10-06" })).toBe(false);
		expect(isPartnerRow(out, { ...inn, subcategory: "Other" })).toBe(false);
		expect(isPartnerRow(out, { ...inn, fromTo: "Nobody" })).toBe(false);
		expect(isPartnerRow(out, { ...inn, account: "Nobody" })).toBe(false);
	});
});
