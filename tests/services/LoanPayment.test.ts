import { describe, expect, it } from "vitest";
import { accountBalances, monthSummary } from "../../snapshot/queries";
import { validateSnapshot } from "../../validation/validate";
import { LedgerError } from "../../services/errors";
import type { LedgerEntry } from "../../domain/types";
import { addMortgage, loadedLedger } from "../helpers/ledgerFixture";

type TestLedger = Awaited<ReturnType<typeof loadedLedger>>["ledger"];

// A real car loan payment: $763.48 left the cash account, of which $143.74 was interest, so the loan
// went down by the $619.74 principal only. The cash account holds $2,000.00 and the loan $200,000.00.
const PRINCIPAL = 61974;
const INTEREST = 14374;
const NOTE = "does not include the interest amount of 143.74, principal only";

const payment = (over = {}) => ({
	date: "2026-10-03", merchant: "CCU FL", subcategory: "Loan payment", cents: PRINCIPAL, interestCents: INTEREST,
	note: "", tags: [], from: "Cash Main", to: "Ioniq 5", ...over,
});

const rows = (ledger: TestLedger, account: string) =>
	ledger.snapshot.months.find((m) => m.account === account && m.month === "2026-10")?.transactions ?? [];
const entryOf = (ledger: TestLedger, account: string, at = 0): LedgerEntry => ({ ...rows(ledger, account)[at], account });
const balance = (ledger: TestLedger, name: string) => accountBalances(ledger.snapshot).find((b) => b.account.name === name)!.balanceCents;

async function withLoan() {
	const fixture = await loadedLedger();
	await addMortgage(fixture.ledger, "Ioniq 5");
	return fixture;
}

describe("adding a loan payment with interest", () => {
	it("takes principal plus interest out of cash and lowers the loan by the principal only", async () => {
		const { ledger } = await withLoan();
		await ledger.transactions.addTransfer(payment());

		expect(rows(ledger, "Cash Main")).toMatchObject([{ amountCents: -76348, fromTo: "Ioniq 5", note: "" }]);
		expect(rows(ledger, "Ioniq 5")).toMatchObject([{ amountCents: 61974, fromTo: "Cash Main", note: NOTE }]);
		expect(balance(ledger, "Cash Main")).toBe(200000 - 76348);
		expect(balance(ledger, "Ioniq 5")).toBe(-20000000 + 61974);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("counts the whole amount that left cash as spending, and the loan row as none", async () => {
		const { ledger } = await withLoan();
		await ledger.transactions.addTransfer(payment());
		expect(monthSummary(ledger.snapshot, "2026-10")).toMatchObject({ incomeCents: 0, expenseCents: 76348 });
	});

	it("writes equal rows and no interest note when there was no interest", async () => {
		const { ledger } = await withLoan();
		await ledger.transactions.addTransfer(payment({ interestCents: 0, note: "extra" }));
		expect(rows(ledger, "Cash Main")[0].amountCents).toBe(-PRINCIPAL);
		expect(rows(ledger, "Ioniq 5")[0]).toMatchObject({ amountCents: PRINCIPAL, note: "extra" });
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("keeps the user's note ahead of the interest note", async () => {
		const { ledger } = await withLoan();
		await ledger.transactions.addTransfer(payment({ note: "autopay" }));
		expect(rows(ledger, "Cash Main")[0].note).toBe("autopay");
		expect(rows(ledger, "Ioniq 5")[0].note).toBe(`autopay; ${NOTE}`);
	});

	it("refuses negative interest and interest on a plain transfer, writing nothing", async () => {
		const { ledger } = await withLoan();
		await expect(ledger.transactions.addTransfer(payment({ interestCents: -1 }))).rejects.toThrow(LedgerError);
		await expect(ledger.transactions.addTransfer(payment({ subcategory: "Account transfer", to: "Savings" }))).rejects.toThrow(LedgerError);
		expect(rows(ledger, "Cash Main")).toEqual([]);
	});

	it("checks the cash account can cover principal plus interest", async () => {
		const { ledger } = await withLoan();
		await expect(ledger.transactions.addTransfer(payment({ cents: 190000, interestCents: 20000 }))).rejects.toThrow(/not enough funds/);
		await ledger.transactions.addTransfer(payment({ cents: 190000, interestCents: 10000 }));
		expect(balance(ledger, "Cash Main")).toBe(0);
	});
});

describe("finding the other half of a loan payment", () => {
	it("finds the loan row from the cash row and the cash row from the loan row, by date and merchant", async () => {
		const { ledger } = await withLoan();
		await ledger.transactions.addTransfer(payment());
		expect(ledger.transactions.partnerOf(entryOf(ledger, "Cash Main"))).toEqual(entryOf(ledger, "Ioniq 5"));
		expect(ledger.transactions.partnerOf(entryOf(ledger, "Ioniq 5"))).toEqual(entryOf(ledger, "Cash Main"));
	});

	it("finds nothing for a plain row, or when the other half is gone or does not fit", async () => {
		const { ledger } = await withLoan();
		await ledger.transactions.add({ account: "Cash Main", date: "2026-10-03", merchant: "Publix", subcategory: "Groceries", amountCents: -500, note: "", tags: [], fromTo: "" });
		expect(ledger.transactions.partnerOf(entryOf(ledger, "Cash Main"))).toBeUndefined();

		await ledger.transactions.addTransfer(payment());
		const cash = entryOf(ledger, "Cash Main", 1);
		expect(ledger.transactions.partnerOf({ ...cash, merchant: "Other" })).toBeUndefined();
		expect(ledger.transactions.partnerOf({ ...cash, amountCents: -100 })).toBeUndefined(); // $1.00 cannot cover a $619.74 loan row
		expect(ledger.transactions.partnerOf(cash)).toBeDefined();
	});

	it("still pairs a plain transfer by its exact opposite amount", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.addTransfer({ ...payment(), subcategory: "Account transfer", to: "Savings", interestCents: 0 });
		expect(ledger.transactions.partnerOf(entryOf(ledger, "Cash Main"))).toEqual(entryOf(ledger, "Savings"));
	});
});

describe("editing and deleting a loan payment", () => {
	it("rewrites both rows with a new interest, without stacking the note", async () => {
		const { ledger } = await withLoan();
		await ledger.transactions.addTransfer(payment());
		await ledger.transactions.updateTransfer(entryOf(ledger, "Cash Main"), payment({ interestCents: 12361 }));

		expect(rows(ledger, "Cash Main")).toMatchObject([{ amountCents: -(PRINCIPAL + 12361) }]);
		expect(rows(ledger, "Ioniq 5")).toMatchObject([{ amountCents: PRINCIPAL, note: "does not include the interest amount of 123.61, principal only" }]);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("drops the interest note when the interest becomes zero", async () => {
		const { ledger } = await withLoan();
		await ledger.transactions.addTransfer(payment());
		await ledger.transactions.updateTransfer(entryOf(ledger, "Ioniq 5"), payment({ interestCents: 0 }));
		expect(rows(ledger, "Ioniq 5")[0].note).toBe("");
		expect(rows(ledger, "Cash Main")[0].amountCents).toBe(-PRINCIPAL);
	});

	it("deleting either row removes the other and restores both balances", async () => {
		const first = await withLoan();
		await first.ledger.transactions.addTransfer(payment());
		await first.ledger.transactions.delete(entryOf(first.ledger, "Cash Main"));
		expect(rows(first.ledger, "Ioniq 5")).toEqual([]);
		expect(balance(first.ledger, "Cash Main")).toBe(200000);
		expect(balance(first.ledger, "Ioniq 5")).toBe(-20000000);

		const second = await withLoan();
		await second.ledger.transactions.addTransfer(payment());
		await second.ledger.transactions.delete(entryOf(second.ledger, "Ioniq 5"));
		expect(rows(second.ledger, "Cash Main")).toEqual([]);
	});

	it("deleting several rows takes each partner with it", async () => {
		const { ledger } = await withLoan();
		await ledger.transactions.addTransfer(payment());
		await ledger.transactions.deleteMany([entryOf(ledger, "Ioniq 5")]);
		expect(rows(ledger, "Cash Main")).toEqual([]);
		expect(rows(ledger, "Ioniq 5")).toEqual([]);
	});

	it("saves a loan payment through the form path", async () => {
		const { ledger } = await withLoan();
		await ledger.transactions.save(null, { kind: "transfer", input: payment() });
		await ledger.transactions.save(entryOf(ledger, "Cash Main"), { kind: "transfer", input: payment({ cents: 70000, interestCents: 100 }) });
		expect(rows(ledger, "Cash Main")[0].amountCents).toBe(-70100);
		expect(rows(ledger, "Ioniq 5")[0].amountCents).toBe(70000);
	});

	it("turns a loan payment into a plain row, removing both halves", async () => {
		const { ledger } = await withLoan();
		await ledger.transactions.addTransfer(payment());
		await ledger.transactions.save(entryOf(ledger, "Cash Main"), {
			kind: "entry",
			entry: { account: "Cash Main", date: "2026-10-03", merchant: "Publix", subcategory: "Groceries", amountCents: -500, note: "", tags: [], fromTo: "" },
		});
		expect(rows(ledger, "Ioniq 5")).toEqual([]);
		expect(rows(ledger, "Cash Main")).toHaveLength(1);
	});
});

describe("two payments on the same day to the same loan", () => {
	const second = { cents: 10000, interestCents: 500 };

	async function withTwo() {
		const fixture = await withLoan();
		await fixture.ledger.transactions.addTransfer(payment());
		await fixture.ledger.transactions.addTransfer(payment(second));
		return fixture;
	}

	it("both validate, and each is paired with the one in the same place in the other file", async () => {
		const { ledger } = await withTwo();
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
		expect(ledger.transactions.partnerOf(entryOf(ledger, "Cash Main", 1))).toEqual(entryOf(ledger, "Ioniq 5", 1));
		expect(ledger.transactions.partnerOf(entryOf(ledger, "Ioniq 5", 0))).toEqual(entryOf(ledger, "Cash Main", 0));
	});

	it("deleting the second payment leaves the first one whole", async () => {
		const { ledger } = await withTwo();
		await ledger.transactions.delete(entryOf(ledger, "Cash Main", 1));
		expect(rows(ledger, "Cash Main")).toMatchObject([{ amountCents: -76348 }]);
		expect(rows(ledger, "Ioniq 5")).toMatchObject([{ amountCents: PRINCIPAL }]);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("deleting the first payment from the loan side leaves the second one whole", async () => {
		const { ledger } = await withTwo();
		await ledger.transactions.delete(entryOf(ledger, "Ioniq 5", 0));
		expect(rows(ledger, "Cash Main")).toMatchObject([{ amountCents: -10500 }]);
		expect(rows(ledger, "Ioniq 5")).toMatchObject([{ amountCents: 10000 }]);
	});
});
