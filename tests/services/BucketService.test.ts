import { describe, expect, it } from "vitest";
import { parseProps } from "../../notes/frontmatter";
import { accountPath } from "../../notes/paths";
import { availability, bucketsOf, findAccount } from "../../snapshot/queries";
import { validateSnapshot } from "../../validation/validate";
import { loadedLedger } from "../helpers/ledgerFixture";

const MAIN = "Cash Main";
const entry = { account: MAIN, date: "2026-10-03", merchant: "", subcategory: "Groceries", amountCents: -1000, note: "", tags: [], fromTo: "" };

async function withFund() {
	const fixture = await loadedLedger();
	await fixture.ledger.buckets.create(MAIN, "Emergency Fund", 1000000);
	await fixture.ledger.buckets.moveIn(MAIN, "Emergency Fund", 50000);
	return fixture;
}

describe("create", () => {
	it("starts a bucket at zero, with its goal when given, and leaves balance and available alone", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.buckets.create(MAIN, "Vacation");
		await ledger.buckets.create(MAIN, "Emergency Fund", 1000000);
		expect(bucketsOf(ledger.snapshot, MAIN)).toEqual([
			{ name: "Vacation", balanceCents: 0 },
			{ name: "Emergency Fund", goalCents: 1000000, balanceCents: 0 },
		]);
		expect(findAccount(ledger.snapshot, MAIN)).toMatchObject({ balanceCents: 200000, availableCents: 200000 });
		expect(parseProps(vault.files.get(accountPath(MAIN))!)).toMatchObject({ balanceCents: 200000, availableCents: 200000 });
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("allows the same name in two accounts but not twice in one", async () => {
		const { ledger } = await loadedLedger();
		await ledger.buckets.create(MAIN, "Emergency Fund");
		await ledger.buckets.create("Savings", "Emergency Fund");
		await expect(ledger.buckets.create(MAIN, "Emergency Fund")).rejects.toThrow(/already exists in Cash Main/);
	});

	it("rejects bad names and goals, unknown accounts and accounts that are not cash", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.buckets.create(MAIN, "a|b")).rejects.toThrow(/not a valid bucket name/);
		await expect(ledger.buckets.create(MAIN, "A", 0)).rejects.toThrow(/goal/);
		await expect(ledger.buckets.create("Nope", "A")).rejects.toThrow(/No account named/);
		await expect(ledger.buckets.create("Card", "A")).rejects.toThrow(/Only a cash account/);
	});

	it("refuses to touch a bucket table with unreadable rows", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.buckets.create(MAIN, "A");
		const path = accountPath(MAIN);
		vault.files.set(path, vault.files.get(path)!.replace("| A |  | 0 |", "| A |  | oops |"));
		await ledger.reload();
		await expect(ledger.buckets.create(MAIN, "B")).rejects.toThrow(/unreadable rows/);
	});
});

describe("moveIn and moveOut", () => {
	it("moving in lowers available and not the balance", async () => {
		const { ledger, vault } = await withFund();
		expect(availability(ledger.snapshot, MAIN)).toEqual({ balanceCents: 200000, bucketsCents: 50000, availableCents: 150000 });
		expect(parseProps(vault.files.get(accountPath(MAIN))!)).toMatchObject({ balanceCents: 200000, availableCents: 150000 });
		expect(findAccount(ledger.snapshot, MAIN)).toMatchObject({ balanceCents: 200000, availableCents: 150000 });
	});

	it("moving out gives it back", async () => {
		const { ledger } = await withFund();
		await ledger.buckets.moveOut(MAIN, "Emergency Fund", 20000);
		expect(bucketsOf(ledger.snapshot, MAIN)[0].balanceCents).toBe(30000);
		expect(findAccount(ledger.snapshot, MAIN)).toMatchObject({ balanceCents: 200000, availableCents: 170000 });
	});

	it("cannot move in more than is available, nor out more than the bucket holds", async () => {
		const { ledger } = await withFund();
		await expect(ledger.buckets.moveIn(MAIN, "Emergency Fund", 150001)).rejects.toThrow(/more than the account has available/);
		await ledger.buckets.moveIn(MAIN, "Emergency Fund", 150000);
		await expect(ledger.buckets.moveIn(MAIN, "Emergency Fund", 1)).rejects.toThrow(/available/);
		await expect(ledger.buckets.moveOut(MAIN, "Emergency Fund", 200001)).rejects.toThrow(/more than the bucket holds/);
	});

	it("rejects bad amounts and unknown buckets", async () => {
		const { ledger } = await withFund();
		await expect(ledger.buckets.moveIn(MAIN, "Emergency Fund", 0)).rejects.toThrow(/more than zero/);
		await expect(ledger.buckets.moveOut(MAIN, "Emergency Fund", 1.5)).rejects.toThrow(/not valid/);
		await expect(ledger.buckets.moveIn(MAIN, "Nope", 1)).rejects.toThrow(/No bucket named "Nope"/);
	});

	it("does not write a transaction", async () => {
		const { ledger, vault } = await withFund();
		await ledger.buckets.moveOut(MAIN, "Emergency Fund", 10000);
		expect(ledger.snapshot.months).toEqual([]);
		expect([...vault.files.keys()].some((p) => p.includes("/Transactions/"))).toBe(false);
	});
});

describe("setGoal, rename and remove", () => {
	it("sets and clears a goal", async () => {
		const { ledger } = await withFund();
		await ledger.buckets.setGoal(MAIN, "Emergency Fund", 777);
		expect(bucketsOf(ledger.snapshot, MAIN)[0].goalCents).toBe(777);
		await ledger.buckets.setGoal(MAIN, "Emergency Fund", undefined);
		expect(bucketsOf(ledger.snapshot, MAIN)[0]).toEqual({ name: "Emergency Fund", balanceCents: 50000 });
		await expect(ledger.buckets.setGoal(MAIN, "Emergency Fund", -1)).rejects.toThrow(/goal/);
		await expect(ledger.buckets.setGoal(MAIN, "Nope", 5)).rejects.toThrow(/No bucket/);
	});

	it("renames a bucket in place without touching anything else", async () => {
		const { ledger } = await withFund();
		await ledger.buckets.create(MAIN, "Vacation");
		await ledger.buckets.rename(MAIN, "Emergency Fund", "Rainy Day");
		expect(bucketsOf(ledger.snapshot, MAIN).map((b) => b.name)).toEqual(["Rainy Day", "Vacation"]);
		expect(bucketsOf(ledger.snapshot, MAIN)[0]).toMatchObject({ balanceCents: 50000, goalCents: 1000000 });
		expect(findAccount(ledger.snapshot, MAIN)!.availableCents).toBe(150000);
	});

	it("rejects renaming to a taken or invalid name, and keeping the same name is fine", async () => {
		const { ledger } = await withFund();
		await ledger.buckets.create(MAIN, "Vacation");
		await expect(ledger.buckets.rename(MAIN, "Vacation", "Emergency Fund")).rejects.toThrow(/already exists/);
		await expect(ledger.buckets.rename(MAIN, "Vacation", "a|b")).rejects.toThrow(/not a valid bucket name/);
		await expect(ledger.buckets.rename(MAIN, "Nope", "X")).rejects.toThrow(/No bucket/);
		await ledger.buckets.rename(MAIN, "Vacation", "Vacation");
	});

	it("deleting a bucket releases its money back into available", async () => {
		const { ledger } = await withFund();
		await ledger.buckets.remove(MAIN, "Emergency Fund");
		expect(bucketsOf(ledger.snapshot, MAIN)).toEqual([]);
		expect(findAccount(ledger.snapshot, MAIN)).toMatchObject({ balanceCents: 200000, availableCents: 200000 });
		await expect(ledger.buckets.remove(MAIN, "Emergency Fund")).rejects.toThrow(/No bucket/);
	});
});

describe("interaction with transactions and accounts", () => {
	it("a transaction changes balance and available by the same amount", async () => {
		const { ledger } = await withFund();
		await ledger.transactions.add(entry);
		expect(findAccount(ledger.snapshot, MAIN)).toMatchObject({ balanceCents: 199000, availableCents: 149000 });
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("an account update keeps available in step with the buckets", async () => {
		const { ledger } = await withFund();
		await ledger.accounts.update(MAIN, { enteredBalanceCents: 100000 });
		expect(findAccount(ledger.snapshot, MAIN)).toMatchObject({ balanceCents: 100000, availableCents: 50000 });
	});

	it("an update that leaves available negative is allowed and reported by validation", async () => {
		const { ledger } = await withFund();
		await ledger.accounts.update(MAIN, { enteredBalanceCents: 20000 });
		expect(findAccount(ledger.snapshot, MAIN)!.availableCents).toBe(-30000);
		expect(validateSnapshot(ledger.snapshot).map((i) => i.type)).toEqual(["negativeAvailable"]);
	});

	it("archiving releases the buckets and says nothing is left in them", async () => {
		const { ledger, vault } = await withFund();
		await ledger.accounts.setActive(MAIN, false);
		expect(bucketsOf(ledger.snapshot, MAIN)).toEqual([]);
		expect(findAccount(ledger.snapshot, MAIN)).toMatchObject({ active: false, balanceCents: 200000, availableCents: 200000 });
		expect(vault.files.get(accountPath(MAIN))).not.toContain("Emergency Fund");
		await ledger.accounts.setActive(MAIN, true);
		expect(bucketsOf(ledger.snapshot, MAIN)).toEqual([]);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("archiving an account without buckets, or a credit card, writes no availability", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.accounts.setActive("Savings", false);
		await ledger.accounts.setActive("Card", false);
		expect(parseProps(vault.files.get(accountPath("Card"))!).availableCents).toBeUndefined();
		expect(findAccount(ledger.snapshot, "Savings")!.active).toBe(false);
	});

	it("deleting an account takes its buckets with it", async () => {
		const { ledger, vault } = await withFund();
		await ledger.accounts.remove(MAIN);
		expect(vault.files.has(accountPath(MAIN))).toBe(false);
		expect(bucketsOf(ledger.snapshot, MAIN)).toEqual([]);
	});

	it("only cash accounts carry availableCents", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.accounts.create({ name: "Brokerage", accountType: "cash", enteredBalanceCents: 500, enteredBalanceAsOf: "2026-10-01" });
		await ledger.accounts.create({ name: "Visa", accountType: "creditCard", enteredBalanceCents: -500, enteredBalanceAsOf: "2026-10-01" });
		expect(parseProps(vault.files.get(accountPath("Brokerage"))!).availableCents).toBe(500);
		expect(parseProps(vault.files.get(accountPath("Visa"))!).availableCents).toBeUndefined();
		await ledger.accounts.update("Visa", { color: "#112233" });
		expect(parseProps(vault.files.get(accountPath("Visa"))!).availableCents).toBeUndefined();
	});
});
