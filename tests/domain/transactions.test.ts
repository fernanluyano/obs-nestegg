import { describe, expect, it } from "vitest";
import { buildCategoryIndex } from "../../domain/categories";
import { defaultCategories } from "../../domain/defaults";
import {
	findTransactionIndex,
	isPartnerRow,
	sameTransaction,
	signedAmount,
	splitAmount,
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
