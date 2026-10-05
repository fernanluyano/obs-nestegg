import { describe, expect, it } from "vitest";
import { balanceAt, currentBalance, netAssetCents } from "../../domain/accounts";
import { transferEntries } from "../../domain/transactions";
import type { Account, Transaction } from "../../domain/types";

const account = (over: Partial<Account> = {}): Account => ({
	name: "Cash Main",
	accountType: "cash",
	active: true,
	includeInNetAsset: true,
	enteredBalanceCents: 200000,
	enteredBalanceAsOf: "2026-10-02",
	balanceCents: 0,
	color: "#378add",
	...over,
});

const row = (date: string, amountCents: number): Transaction => ({
	date, merchant: "", subcategory: "Groceries", amountCents, note: "", tags: [], fromTo: "",
});

describe("currentBalance", () => {
	it("adds rows dated after the entered balance and ignores earlier or same-day rows", () => {
		const rows = [row("2026-10-01", -999), row("2026-10-02", -888), row("2026-10-03", -8450), row("2026-10-04", 1200)];
		expect(currentBalance(account(), rows)).toBe(200000 - 8450 + 1200);
	});

	it("treats credit card balances as debt: spending raises it, payments lower it", () => {
		const card = account({ accountType: "creditCard", enteredBalanceCents: 5000 });
		expect(currentBalance(card, [row("2026-10-03", -2000), row("2026-10-04", 500)])).toBe(5000 + 2000 - 500);
	});

	it("counts each half of a transfer only in its own account", () => {
		const [out, in_] = transferEntries({
			date: "2026-10-05", merchant: "", subcategory: "Account transfer", cents: 5000, note: "", tags: [], from: "Cash Main", to: "Card",
		});
		const card = account({ name: "Card", accountType: "creditCard", enteredBalanceCents: 20000 });
		expect(currentBalance(account(), [out])).toBe(200000 - 5000);
		expect(currentBalance(card, [in_])).toBe(20000 - 5000);
	});

	it("is the entered balance when nothing follows it", () => {
		expect(currentBalance(account(), [])).toBe(200000);
	});
});

describe("balanceAt", () => {
	const rows = [row("2026-09-20", -1000), row("2026-10-01", -500), row("2026-10-03", -300), row("2026-10-10", 700)];

	it("replays forward from the checkpoint", () => {
		expect(balanceAt(account(), rows, "2026-10-02")).toBe(200000);
		expect(balanceAt(account(), rows, "2026-10-03")).toBe(200000 - 300);
		expect(balanceAt(account(), rows, "2026-10-31")).toBe(200000 - 300 + 700);
	});

	it("replays backward for dates before the checkpoint", () => {
		expect(balanceAt(account(), rows, "2026-10-01")).toBe(200000 + 0);
		expect(balanceAt(account(), rows, "2026-09-30")).toBe(200000 + 500);
		expect(balanceAt(account(), rows, "2026-09-01")).toBe(200000 + 500 + 1000);
	});

	it("flips the direction for credit cards", () => {
		const card = account({ accountType: "creditCard", enteredBalanceCents: 5000 });
		expect(balanceAt(card, rows, "2026-10-31")).toBe(5000 - (-300 + 700));
		expect(balanceAt(card, rows, "2026-09-30")).toBe(5000 - 500);
	});

	it("agrees with currentBalance at the far future", () => {
		expect(balanceAt(account(), rows, "9999-12-31")).toBe(currentBalance(account(), rows));
	});
});

describe("netAssetCents", () => {
	it("adds cash, subtracts debt and skips accounts excluded from net asset", () => {
		const balances = [
			{ account: account(), balanceCents: 10000 },
			{ account: account({ accountType: "creditCard" }), balanceCents: 3000 },
			{ account: account({ includeInNetAsset: false }), balanceCents: 99999 },
		];
		expect(netAssetCents(balances)).toBe(7000);
	});

	it("is zero for no accounts", () => {
		expect(netAssetCents([])).toBe(0);
	});
});
