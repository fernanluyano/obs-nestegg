import { describe, expect, it } from "vitest";
import { balanceAt } from "../../domain/accounts";
import { MonthDeltaCache, balanceAccounts, dailyBalances, hiddenBalances } from "../../snapshot/runningBalance";
import { accountTransactions, buildSnapshot } from "../../snapshot/snapshot";
import { account, monthInput, tx, vaultInputs } from "../helpers/fixtures";

const cash = (over = {}) => account({ enteredBalanceCents: 100000, enteredBalanceAsOf: "2026-09-30", ...over });
const card = account({ name: "Card", accountType: "creditCard", enteredBalanceCents: -5000, enteredBalanceAsOf: "2026-09-30" });

const snapshot = (accounts = [cash(), card]) =>
	buildSnapshot(
		vaultInputs({
			accounts,
			months: [
				monthInput("Cash Main", "2026-09", [tx({ date: "2026-09-10", amountCents: -1000 })]),
				monthInput("Cash Main", "2026-10", [
					tx({ date: "2026-10-03", amountCents: -8450 }),
					tx({ date: "2026-10-03", amountCents: -550, merchant: "Shell" }),
					tx({ date: "2026-10-05", amountCents: 250000, subcategory: "Salary" }),
				]),
				monthInput("Cash Main", "2026-11", [tx({ date: "2026-11-02", amountCents: -2000 })]),
				monthInput("Card", "2026-10", [tx({ date: "2026-10-04", amountCents: -3000 })]),
			],
		}),
	);

describe("dailyBalances", () => {
	it("shows one balance per date, after all of that day's rows", () => {
		const balances = dailyBalances(snapshot(), new MonthDeltaCache(), "2026-10", ["Cash Main"]);
		expect([...balances].map(([date, byAccount]) => [date, [...byAccount]])).toEqual([
			["2026-10-03", [["Cash Main", 100000 - 8450 - 550]]],
			["2026-10-05", [["Cash Main", 100000 - 8450 - 550 + 250000]]],
		]);
	});

	it("carries the balance in from earlier months, skipping rows before the entered balance", () => {
		const snap = snapshot();
		const balances = dailyBalances(snap, new MonthDeltaCache(), "2026-11", ["Cash Main"]);
		expect(balances.get("2026-11-02")?.get("Cash Main")).toBe(100000 - 8450 - 550 + 250000 - 2000);
	});

	it("keeps each account's own balance, with a credit card held negative", () => {
		const balances = dailyBalances(snapshot(), new MonthDeltaCache(), "2026-10", ["Cash Main", "Card"]);
		expect([...balances.keys()]).toEqual(["2026-10-03", "2026-10-04", "2026-10-05"]);
		expect([...balances.get("2026-10-03")!]).toEqual([["Card", -5000], ["Cash Main", 91000]]);
		expect([...balances.get("2026-10-04")!]).toEqual([["Card", -8000], ["Cash Main", 91000]]);
		expect([...balances.get("2026-10-05")!]).toEqual([["Card", -8000], ["Cash Main", 91000 + 250000]]);
	});

	it("lists every chosen account on a date even if only another account has rows that day", () => {
		const balances = dailyBalances(snapshot(), new MonthDeltaCache(), "2026-10", []);
		expect([...balances.get("2026-10-05")!.keys()]).toEqual(["Card", "Cash Main"]);
	});

	it("lists an account with no rows in the month at its carried-in balance", () => {
		const balances = dailyBalances(snapshot([cash(), card, account({ name: "Savings", enteredBalanceCents: 777, enteredBalanceAsOf: "2026-09-30" })]), new MonthDeltaCache(), "2026-10", []);
		expect(balances.get("2026-10-03")?.get("Savings")).toBe(777);
	});

	it("lists the accounts that have rows on the same date in the snapshot's account order", () => {
		const snap = buildSnapshot(
			vaultInputs({
				accounts: [cash(), card],
				months: [
					monthInput("Card", "2026-10", [tx({ date: "2026-10-03", amountCents: -3000 })]),
					monthInput("Cash Main", "2026-10", [tx({ date: "2026-10-03", amountCents: -1000 })]),
				],
			}),
		);
		const day = dailyBalances(snap, new MonthDeltaCache(), "2026-10", []).get("2026-10-03")!;
		expect([...day]).toEqual([["Card", -8000], ["Cash Main", 99000]]);
	});

	it("covers every account when none is chosen", () => {
		const snap = snapshot();
		const cache = new MonthDeltaCache();
		expect(dailyBalances(snap, cache, "2026-10", [])).toEqual(dailyBalances(snap, cache, "2026-10", ["Cash Main", "Card"]));
	});

	it("leaves archived accounts out", () => {
		const snap = snapshot([cash(), card, account({ name: "Old", active: false, enteredBalanceCents: 5 })]);
		const balances = dailyBalances(snap, new MonthDeltaCache(), "2026-10", []);
		expect([...balances.get("2026-10-03")!.keys()]).toEqual(["Card", "Cash Main"]);
		expect([...dailyBalances(snap, new MonthDeltaCache(), "2026-10", ["Old"])]).toEqual([]);
	});

	it("is empty for a month with no rows", () => {
		expect(dailyBalances(snapshot(), new MonthDeltaCache(), "2026-12", [])).toEqual(new Map());
	});

	it.each([
		["checkpoint before the month", "2026-09-30"],
		["checkpoint inside the month", "2026-10-04"],
		["checkpoint on a row's date", "2026-10-05"],
		["checkpoint after the month", "2026-11-15"],
	])("agrees with replaying the rows: %s", (_label, asOf) => {
		const accounts = [cash({ enteredBalanceAsOf: asOf }), { ...card, enteredBalanceAsOf: asOf }];
		const snap = snapshot(accounts);
		for (const a of accounts) {
			const balances = dailyBalances(snap, new MonthDeltaCache(), "2026-10", [a.name]);
			for (const [date, byAccount] of balances) {
				expect(byAccount.get(a.name)).toBe(balanceAt(a, accountTransactions(snap, a.name), date));
			}
		}
	});
});

describe("MonthDeltaCache", () => {
	it("computes a month once and reuses it", () => {
		const cache = new MonthDeltaCache();
		const snap = snapshot();
		expect(cache.has("2026-10")).toBe(false);
		const first = cache.get(snap, "2026-10");
		expect(cache.has("2026-10")).toBe(true);
		expect(cache.get(snap, "2026-10")).toBe(first);
		expect(first.get("Cash Main")?.totalCents).toBe(-8450 - 550 + 250000);
		expect(first.get("Cash Main")?.days.get("2026-10-03")).toBe(-9000);
	});

	it("drops only the months it is told to", () => {
		const cache = new MonthDeltaCache();
		const snap = snapshot();
		cache.get(snap, "2026-09");
		cache.get(snap, "2026-10");
		cache.invalidate(["2026-10"]);
		expect(cache.has("2026-09")).toBe(true);
		expect(cache.has("2026-10")).toBe(false);
	});

	it("clears everything", () => {
		const cache = new MonthDeltaCache();
		cache.get(snapshot(), "2026-10");
		cache.clear();
		expect(cache.has("2026-10")).toBe(false);
	});

	it("serves a stale month until it is invalidated", () => {
		const cache = new MonthDeltaCache();
		cache.get(snapshot(), "2026-10");
		const changed = buildSnapshot(vaultInputs({ accounts: [cash()], months: [monthInput("Cash Main", "2026-10", [tx({ amountCents: -1 })])] }));
		expect(cache.get(changed, "2026-10").get("Cash Main")?.totalCents).toBe(-8450 - 550 + 250000);
		cache.invalidate(["2026-10"]);
		expect(cache.get(changed, "2026-10").get("Cash Main")?.totalCents).toBe(-1);
	});
});

describe("balanceAccounts", () => {
	const snap = snapshot([cash(), card, account({ name: "Old", active: false })]);

	it("lists every active account when none is chosen", () => {
		expect(balanceAccounts(snap, [])).toEqual(["Card", "Cash Main"]);
	});

	it("lists only the chosen active accounts", () => {
		expect(balanceAccounts(snap, ["Cash Main", "Old"])).toEqual(["Cash Main"]);
	});
});

describe("balances switched off for a month", () => {
	const off = () => {
		const snap = snapshot();
		snap.months.find((m) => m.account === "Card" && m.month === "2026-10")!.showBalance = false;
		return snap;
	};

	it("skips the account in the daily balances but not in the legend list", () => {
		const snap = off();
		const balances = dailyBalances(snap, new MonthDeltaCache(), "2026-10", []);
		expect([...balances.values()].every((byAccount) => !byAccount.has("Card"))).toBe(true);
		expect(balances.has("2026-10-04")).toBe(false);
		expect(balanceAccounts(snap, [])).toContain("Card");
		expect(hiddenBalances(snap, "2026-10")).toEqual(new Set(["Card"]));
	});

	it("only affects that month", () => {
		expect(hiddenBalances(off(), "2026-11").size).toBe(0);
	});
});
