import { describe, expect, it } from "vitest";
import { balanceAt, balanceSignProblem, currentBalance, loanFieldProblem, loanSchedule, netAssetCents, parsePlanFields } from "../../domain/accounts";
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

	it("holds debt negative: spending deepens it, payments move it toward zero", () => {
		const card = account({ accountType: "creditCard", enteredBalanceCents: -5000 });
		expect(currentBalance(card, [row("2026-10-03", -2000), row("2026-10-04", 500)])).toBe(-5000 - 2000 + 500);
	});

	it("lowers a loan only by payments", () => {
		const loan = account({ accountType: "loan", loanKind: "mortgage", enteredBalanceCents: -20000000 });
		expect(currentBalance(loan, [row("2026-10-03", 50000), row("2026-11-03", 50000)])).toBe(-20000000 + 100000);
	});

	it("counts each half of a transfer only in its own account", () => {
		const [out, in_] = transferEntries({
			date: "2026-10-05", merchant: "", subcategory: "Account transfer", cents: 5000, note: "", tags: [], from: "Cash Main", to: "Card",
		});
		const card = account({ name: "Card", accountType: "creditCard", enteredBalanceCents: -20000 });
		expect(currentBalance(account(), [out])).toBe(200000 - 5000);
		expect(currentBalance(card, [in_])).toBe(-20000 + 5000);
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

	it("replays debt accounts by plain addition too", () => {
		const card = account({ accountType: "creditCard", enteredBalanceCents: -5000 });
		expect(balanceAt(card, rows, "2026-10-31")).toBe(-5000 + (-300 + 700));
		expect(balanceAt(card, rows, "2026-09-30")).toBe(-5000 + 500);
	});

	it("agrees with currentBalance at the far future", () => {
		expect(balanceAt(account(), rows, "9999-12-31")).toBe(currentBalance(account(), rows));
	});
});

describe("netAssetCents", () => {
	it("adds the balances, debt being negative, and skips accounts excluded from net asset", () => {
		const balances = [
			{ account: account(), balanceCents: 10000 },
			{ account: account({ accountType: "creditCard" }), balanceCents: -3000 },
			{ account: account({ accountType: "loan", loanKind: "car" }), balanceCents: -1500 },
			{ account: account({ includeInNetAsset: false }), balanceCents: 99999 },
		];
		expect(netAssetCents(balances)).toBe(5500);
	});

	it("is zero for no accounts", () => {
		expect(netAssetCents([])).toBe(0);
	});
});

describe("loanSchedule", () => {
	it("ends the original term after the start month and counts the months left from today", () => {
		expect(loanSchedule({ startDate: "2022-09-01", termMonths: 360 }, "2026-10-07")).toEqual({ endMonth: "2052-09", monthsLeft: 311 });
		expect(loanSchedule({ startDate: "2026-02-01", termMonths: 47 }, "2026-10-07")).toEqual({ endMonth: "2030-01", monthsLeft: 39 });
		expect(loanSchedule({ startDate: "2025-05-01", termMonths: 60 }, "2026-10-07")).toEqual({ endMonth: "2030-05", monthsLeft: 43 });
	});

	it("rolls the year over at the end of December", () => {
		expect(loanSchedule({ startDate: "2024-12-15", termMonths: 12 }, "2025-01-01")).toEqual({ endMonth: "2025-12", monthsLeft: 11 });
		expect(loanSchedule({ startDate: "2024-01-31", termMonths: 12 }, "2024-01-01")).toEqual({ endMonth: "2025-01", monthsLeft: 12 });
	});

	it("never goes below zero once the term is over", () => {
		expect(loanSchedule({ startDate: "2020-01-01", termMonths: 12 }, "2026-10-07")).toEqual({ endMonth: "2021-01", monthsLeft: 0 });
	});

	it("is null without a start date or a term", () => {
		expect(loanSchedule({ termMonths: 60 }, "2026-10-07")).toBeNull();
		expect(loanSchedule({ startDate: "2025-05-01" }, "2026-10-07")).toBeNull();
		expect(loanSchedule({}, "2026-10-07")).toBeNull();
	});
});

describe("balanceSignProblem", () => {
	it("wants debt entered zero or negative", () => {
		for (const type of ["creditCard", "loan"] as const) {
			expect(balanceSignProblem(type, -300000)).toBeNull();
			expect(balanceSignProblem(type, 0)).toBeNull();
			expect(balanceSignProblem(type, 300000)).toBe("debtPositive");
		}
	});

	it("wants cash zero or positive", () => {
		expect(balanceSignProblem("cash", 300000)).toBeNull();
		expect(balanceSignProblem("cash", 0)).toBeNull();
		expect(balanceSignProblem("cash", -1)).toBe("cashNegative");
	});
});

describe("loanFieldProblem", () => {
	it("accepts a loan with none of the optional fields", () => {
		expect(loanFieldProblem({ loanKind: "other" })).toBeNull();
		expect(loanFieldProblem({})).toBeNull();
	});

	it("accepts a full valid plan", () => {
		expect(loanFieldProblem({ loanKind: "mortgage", termMonths: 360, startDate: "2024-03-01", interest: 6.25 })).toBeNull();
		expect(loanFieldProblem({ interest: 0 })).toBeNull();
		expect(loanFieldProblem({ interest: 4.875 })).toBeNull();
	});

	it.each([
		[{ termMonths: 0 }],
		[{ termMonths: -12 }],
		[{ termMonths: 12.5 }],
		[{ startDate: "2024-13-01" }],
		[{ startDate: "soon" }],
		[{ interest: -1 }],
		[{ interest: 6.2555 }],
		[{ loanKind: "boat" as never }],
	])("rejects %j", (fields) => {
		expect(loanFieldProblem(fields)).not.toBeNull();
	});
});

describe("parsePlanFields", () => {
	const blank = { termMonths: "", startDate: "", interest: "" };

	it("reads blank fields as not set", () => {
		expect(parsePlanFields(blank)).toEqual({ ok: true, fields: {} });
	});

	it("takes a three-decimal rate such as the 4.875 mortgage", () => {
		expect(parsePlanFields({ ...blank, interest: "4.875" })).toEqual({ ok: true, fields: { interest: 4.875 } });
	});

	it("reads typed values", () => {
		expect(parsePlanFields({ termMonths: " 360 ", startDate: "2024-03-01", interest: "6.25" })).toEqual({
			ok: true, fields: { termMonths: 360, startDate: "2024-03-01", interest: 6.25 },
		});
	});

	it.each([
		[{ termMonths: "0" }, "term"],
		[{ termMonths: "1.5" }, "term"],
		[{ termMonths: "-3" }, "term"],
		[{ startDate: "2024-02-30" }, "start"],
		[{ interest: "-1" }, "interest"],
		[{ interest: "1.2345" }, "interest"],
		[{ interest: "abc" }, "interest"],
	])("rejects %j", (over, error) => {
		expect(parsePlanFields({ ...blank, ...over })).toEqual({ ok: false, error });
	});
});
