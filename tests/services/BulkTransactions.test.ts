import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "../../domain/types";
import { monthPath } from "../../notes/paths";
import { accountBalances, monthEntries } from "../../snapshot/queries";
import { LedgerError } from "../../services/errors";
import { validateSnapshot } from "../../validation/validate";
import { loadedLedger } from "../helpers/ledgerFixture";

type Fixture = Awaited<ReturnType<typeof loadedLedger>>;

const row = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
	account: "Cash Main", date: "2026-10-03", merchant: "", subcategory: "Groceries", amountCents: -1000, note: "", tags: [], fromTo: "", ...over,
});

const all = (ledger: Fixture["ledger"]) => ledger.snapshot.months.flatMap((m) => m.transactions.map((t) => ({ account: m.account, month: m.month, ...t })));
const balance = (ledger: Fixture["ledger"], name: string) => accountBalances(ledger.snapshot).find((b) => b.account.name === name)!.balanceCents;
const picked = (ledger: Fixture["ledger"], ...merchants: string[]) =>
	[...monthEntries(ledger.snapshot, "2026-10"), ...monthEntries(ledger.snapshot, "2026-09")].filter((e) => merchants.includes(e.merchant));

async function seeded(): Promise<Fixture> {
	const fixture = await loadedLedger();
	const { transactions } = fixture.ledger;
	await transactions.add(row({ merchant: "A", amountCents: -1000 }));
	await transactions.add(row({ merchant: "B", amountCents: -2000, subcategory: "Restaurants" }));
	await transactions.add(row({ merchant: "C", amountCents: -3000, date: "2026-09-10" }));
	await transactions.add(row({ merchant: "D", account: "Savings", amountCents: -4000 }));
	await transactions.add(row({ merchant: "Pay", subcategory: "Salary", amountCents: 50000 }));
	return fixture;
}

describe("deleteMany", () => {
	it("removes the selected rows across months and accounts and keeps the rest", async () => {
		const { ledger } = await seeded();
		await ledger.transactions.deleteMany(picked(ledger, "A", "C", "D"));
		expect(all(ledger).map((t) => t.merchant).sort()).toEqual(["B", "Pay"]);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("refreshes month totals and account balances", async () => {
		const { ledger } = await seeded();
		await ledger.transactions.deleteMany(picked(ledger, "A", "D"));
		// The September row predates the account's 2026-10-02 checkpoint, so it never moves the balance.
		expect(balance(ledger, "Cash Main")).toBe(200000 - 2000 + 50000);
		expect(balance(ledger, "Savings")).toBe(200000);
		expect(ledger.snapshot.months.find((m) => m.account === "Cash Main" && m.month === "2026-10")!.stored.expenseCents).toBe(2000);
	});

	it("writes one file once when the rows share a month", async () => {
		const { ledger, vault } = await seeded();
		await ledger.transactions.deleteMany(picked(ledger, "A", "B"));
		expect(vault.trashed).toEqual([]);
		expect(vault.files.get(monthPath("Cash Main", "2026-10"))).not.toContain("| A |");
	});

	it("takes a transfer's other half along, once, whether or not it was selected", async () => {
		const { ledger } = await seeded();
		await ledger.transactions.addTransfer({ date: "2026-10-05", merchant: "T1", subcategory: "Account transfer", cents: 5000, note: "", tags: [], from: "Cash Main", to: "Savings" });
		await ledger.transactions.addTransfer({ date: "2026-10-06", merchant: "T2", subcategory: "Account transfer", cents: 700, note: "", tags: [], from: "Cash Main", to: "Savings" });

		const t1 = monthEntries(ledger.snapshot, "2026-10").filter((e) => e.merchant === "T1");
		const t2Out = monthEntries(ledger.snapshot, "2026-10").find((e) => e.merchant === "T2" && e.account === "Cash Main")!;
		await ledger.transactions.deleteMany([...t1, t2Out]);

		expect(all(ledger).some((t) => t.merchant === "T1" || t.merchant === "T2")).toBe(false);
		expect(balance(ledger, "Savings")).toBe(200000 - 4000);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("deletes duplicate rows one for one", async () => {
		const { ledger } = await loadedLedger();
		for (let i = 0; i < 3; i++) await ledger.transactions.add(row({ merchant: "Same" }));
		await ledger.transactions.deleteMany(monthEntries(ledger.snapshot, "2026-10").slice(0, 2));
		expect(all(ledger)).toHaveLength(1);
	});

	it("does nothing for an empty selection and refuses rows that are gone", async () => {
		const { ledger } = await seeded();
		await ledger.transactions.deleteMany([]);
		expect(all(ledger)).toHaveLength(5);
		await expect(ledger.transactions.deleteMany([row({ merchant: "Ghost", date: "2027-01-01" })])).rejects.toThrow(/no longer in the file/);
		await expect(ledger.transactions.deleteMany([row({ merchant: "Ghost" })])).rejects.toThrow(/not found/);
	});

	it("leaves every file as it was when a change spanning files fails", async () => {
		const { ledger, vault } = await seeded();
		const before = new Map(vault.files);
		const ghost = row({ merchant: "Ghost", date: "2026-09-20" });
		await expect(ledger.transactions.deleteMany([...picked(ledger, "A"), ghost])).rejects.toThrow();
		expect([...vault.files]).toEqual([...before]);
	});
});

describe("reassignMany", () => {
	it("points the rows at the new subcategory and keeps everything else", async () => {
		const { ledger } = await seeded();
		await ledger.transactions.reassignMany(picked(ledger, "A", "C", "D"), "Rent");
		const rows = all(ledger);
		expect(rows.filter((t) => t.subcategory === "Rent").map((t) => [t.merchant, t.amountCents, t.date]).sort()).toEqual([
			["A", -1000, "2026-10-03"], ["C", -3000, "2026-09-10"], ["D", -4000, "2026-10-03"],
		]);
		expect(rows.find((t) => t.merchant === "B")!.subcategory).toBe("Restaurants");
		expect(balance(ledger, "Cash Main")).toBe(200000 - 1000 - 2000 + 50000);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("skips rows that are already there", async () => {
		const { ledger, vault } = await seeded();
		const before = vault.files.get(monthPath("Cash Main", "2026-10"));
		await ledger.transactions.reassignMany(picked(ledger, "A"), "Groceries");
		expect(vault.files.get(monthPath("Cash Main", "2026-10"))).toBe(before);
	});

	it("refuses mixed types, transfers, other-type targets and nothing selected", async () => {
		const { ledger } = await seeded();
		await expect(ledger.transactions.reassignMany(picked(ledger, "A", "Pay"), "Rent")).rejects.toThrow(/different types/);
		await expect(ledger.transactions.reassignMany(picked(ledger, "A"), "Salary")).rejects.toThrow(/same type/);
		await expect(ledger.transactions.reassignMany([], "Rent")).rejects.toThrow(/nothing is selected/);
		await ledger.transactions.addTransfer({ date: "2026-10-05", merchant: "T", subcategory: "Account transfer", cents: 5, note: "", tags: [], from: "Cash Main", to: "Savings" });
		await expect(ledger.transactions.reassignMany(picked(ledger, "T"), "Rent")).rejects.toThrow(LedgerError);
		expect(all(ledger).filter((t) => t.subcategory === "Rent")).toEqual([]);
	});

	it("reassigns income rows within income and keeps refunds as expenses", async () => {
		const { ledger } = await seeded();
		await ledger.transactions.reassignMany(picked(ledger, "Pay"), "Interest");
		await ledger.transactions.add(row({ merchant: "Refund", amountCents: 500 }));
		await ledger.transactions.reassignMany(picked(ledger, "Refund"), "Rent");
		const byMerchant = new Map(all(ledger).map((t) => [t.merchant, t]));
		expect(byMerchant.get("Pay")!.subcategory).toBe("Interest");
		expect(byMerchant.get("Refund")).toMatchObject({ subcategory: "Rent", amountCents: 500 });
	});
});
