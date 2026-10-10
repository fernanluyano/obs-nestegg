import { describe, expect, it } from "vitest";
import { findAccount } from "../../snapshot/queries";
import { validateSnapshot } from "../../validation/validate";
import { loadedLedger } from "../helpers/ledgerFixture";

const MAIN = "Cash Main";
const entry = (amountCents: number, over = {}) => ({ account: MAIN, date: "2026-10-03", merchant: "", subcategory: "Groceries", amountCents, note: "", tags: [], fromTo: "", ...over });
const transfer = (cents: number, to = "Savings") => ({
	date: "2026-10-03", merchant: "", subcategory: "Account transfer", cents, note: "", tags: [], from: MAIN, to,
});

// $2,000 in Cash Main with $1,000 set aside, so $1,000 is available.
async function bucketed() {
	const fixture = await loadedLedger();
	await fixture.ledger.buckets.create(MAIN, "Emergency Fund");
	await fixture.ledger.buckets.moveIn(MAIN, "Emergency Fund", 100000);
	return fixture;
}

describe("a new expense", () => {
	it("is allowed up to what is available", async () => {
		const { ledger } = await bucketed();
		await ledger.transactions.add(entry(-100000));
		expect(findAccount(ledger.snapshot, MAIN)).toMatchObject({ balanceCents: 100000, availableCents: 0 });
	});

	it("is rejected, with a hint about the buckets, when only the buckets can cover it", async () => {
		const { ledger } = await bucketed();
		await expect(ledger.transactions.add(entry(-120000))).rejects.toThrow(
			"Cannot save the transaction: available in Cash Main is $1,000.00, this needs $1,200.00. Your buckets hold $1,000.00. Move money out of a bucket to cover it.",
		);
		expect(ledger.snapshot.months).toEqual([]);
	});

	it("is rejected as plain not enough funds when the balance could not cover it either", async () => {
		const { ledger } = await bucketed();
		await expect(ledger.transactions.add(entry(-250000))).rejects.toThrow("not enough funds in Cash Main");
	});

	it("is held to the same rule on an account with no buckets", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.transactions.add(entry(-200001))).rejects.toThrow(/not enough funds/);
		await ledger.transactions.add(entry(-200000));
	});

	it("never blocks income or a refund", async () => {
		const { ledger } = await bucketed();
		await ledger.transactions.add(entry(5000, { subcategory: "Salary" }));
		await ledger.transactions.add(entry(5000));
		expect(findAccount(ledger.snapshot, MAIN)!.balanceCents).toBe(210000);
	});

	it("is not an outflow when dated before the balance checkpoint", async () => {
		const { ledger } = await bucketed();
		await ledger.transactions.add(entry(-999999, { date: "2026-09-01" }));
		expect(findAccount(ledger.snapshot, MAIN)!.balanceCents).toBe(200000);
	});

	it("does not touch a credit card", async () => {
		const { ledger } = await bucketed();
		await ledger.transactions.add(entry(-999999, { account: "Card" }));
		expect(findAccount(ledger.snapshot, "Card")!.balanceCents).toBe(-999999);
	});

	it("is rejected once available is already negative", async () => {
		const { ledger } = await bucketed();
		await ledger.accounts.update(MAIN, { enteredBalanceCents: 50000 });
		await expect(ledger.transactions.add(entry(-1))).rejects.toThrow(/Move money out of a bucket/);
	});
});

describe("a new transfer or debt payment", () => {
	it("is rejected when it would take more than is available", async () => {
		const { ledger } = await bucketed();
		await expect(ledger.transactions.addTransfer(transfer(150000))).rejects.toThrow(/Move money out of a bucket/);
		expect(ledger.snapshot.months).toEqual([]);
	});

	it("is allowed within available, and the receiving account is not checked", async () => {
		const { ledger } = await bucketed();
		await ledger.transactions.addTransfer(transfer(100000));
		expect(findAccount(ledger.snapshot, MAIN)).toMatchObject({ balanceCents: 100000, availableCents: 0 });
		expect(findAccount(ledger.snapshot, "Savings")).toMatchObject({ balanceCents: 300000, availableCents: 300000 });
	});

	it("goes through save() the same way for a new transaction", async () => {
		const { ledger } = await bucketed();
		await expect(ledger.transactions.save(null, { kind: "transfer", input: transfer(150000) })).rejects.toThrow(/buckets/);
		await expect(ledger.transactions.save(null, { kind: "entry", entry: entry(-150000) })).rejects.toThrow(/buckets/);
	});
});

describe("edits and deletes", () => {
	it("are never blocked, even when they leave available negative, and validation reports it", async () => {
		const { ledger } = await bucketed();
		await ledger.transactions.add(entry(-50000));
		const row = ledger.snapshot.months[0].transactions[0];
		await ledger.transactions.update({ ...row, account: MAIN }, entry(-150000));
		expect(findAccount(ledger.snapshot, MAIN)).toMatchObject({ balanceCents: 50000, availableCents: -50000 });
		expect(validateSnapshot(ledger.snapshot).map((i) => i.type)).toEqual(["negativeAvailable"]);
	});

	it("deleting income that was covering a bucket is allowed too", async () => {
		const { ledger } = await bucketed();
		await ledger.transactions.add(entry(300000, { subcategory: "Salary" }));
		await ledger.buckets.moveIn(MAIN, "Emergency Fund", 300000);
		await ledger.transactions.delete({ ...ledger.snapshot.months[0].transactions[0], account: MAIN });
		expect(findAccount(ledger.snapshot, MAIN)).toMatchObject({ balanceCents: 200000, availableCents: -200000 });
		expect(validateSnapshot(ledger.snapshot).map((i) => i.type)).toEqual(["negativeAvailable"]);
	});
});
