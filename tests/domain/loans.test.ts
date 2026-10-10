import { describe, expect, it } from "vitest";
import { loanDebt, payoffCharts, percentPaid, projectLoan, standardPaymentCents } from "../../domain/loans";
import type { Account } from "../../domain/types";

const loan = (over: Partial<Account> = {}): Account => ({
	name: "Car",
	accountType: "loan",
	active: true,
	includeInNetAsset: true,
	enteredBalanceCents: -1000000,
	enteredBalanceAsOf: "2026-10-01",
	balanceCents: -1000000,
	color: "#378add",
	loanKind: "car",
	...over,
});

describe("standardPaymentCents", () => {
	it("matches the textbook amortizing payment, to the cent", () => {
		expect(standardPaymentCents(20000000, 6, 360)).toBe(119910);
	});

	it("splits an interest-free loan evenly", () => {
		expect(standardPaymentCents(120000, 0, 12)).toBe(10000);
	});
});

describe("projectLoan", () => {
	it("starts at the balance, falls every month and ends at exactly zero", () => {
		const { balances, payoffMonths, paymentCents } = projectLoan(1000000, 6, 12);
		expect(balances[0]).toBe(1000000);
		expect(balances).toHaveLength(13);
		expect(balances[12]).toBe(0);
		expect(payoffMonths).toBe(12);
		expect(paymentCents).toBe(86066);
		for (let i = 1; i < balances.length; i++) expect(balances[i]).toBeLessThan(balances[i - 1]);
	});

	it("keeps whole cents throughout", () => {
		for (const b of projectLoan(1234567, 4.875, 48).balances) expect(Number.isInteger(b)).toBe(true);
	});

	it("stops early when rounding clears the balance before the last month", () => {
		const { balances, payoffMonths } = projectLoan(100, 0, 3);
		expect(payoffMonths).toBe(balances.length - 1);
		expect(balances[balances.length - 1]).toBe(0);
	});
});

describe("percentPaid", () => {
	it("is null without an original amount", () => {
		expect(percentPaid(undefined, 500)).toBeNull();
	});

	it("is the share of the original already paid, to one decimal", () => {
		expect(percentPaid(1000000, 750000)).toBe(25);
		expect(percentPaid(3, 2)).toBe(33.3);
	});

	it("stays between 0 and 100", () => {
		expect(percentPaid(1000, 5000)).toBe(0);
		expect(percentPaid(1000, 0)).toBe(100);
	});
});

describe("loanDebt", () => {
	const full = loan({ interest: 6, termMonths: 60, startDate: "2026-04-01", originalCents: 2000000 });

	it("derives owed, progress, elapsed months and the projection", () => {
		const debt = loanDebt(full, -1000000, "2026-10-04");
		expect(debt.owedCents).toBe(1000000);
		expect(debt.percentPaid).toBe(50);
		expect(debt.monthsElapsed).toBe(6);
		expect(debt.projection?.payoffMonths).toBe(54);
	});

	it("shows only what can be derived when fields are missing", () => {
		const debt = loanDebt(loan(), -1000000, "2026-10-04");
		expect(debt).toMatchObject({ owedCents: 1000000, percentPaid: null, monthsElapsed: null, projection: null });
	});

	it("needs interest as well as a term and start date to project", () => {
		expect(loanDebt(loan({ termMonths: 60, startDate: "2026-04-01" }), -1000000, "2026-10-04").projection).toBeNull();
	});

	it("does not project a loan that is paid off", () => {
		expect(loanDebt(full, 0, "2026-10-04").projection).toBeNull();
		expect(loanDebt(full, 5000, "2026-10-04").owedCents).toBe(0);
	});

	it("shows a loan past its term that still owes money as one last month", () => {
		const late = loanDebt(loan({ interest: 6, termMonths: 12, startDate: "2024-01-01" }), -50000, "2026-10-04");
		expect(late.projection?.payoffMonths).toBe(1);
	});

	it("never counts months elapsed below zero", () => {
		expect(loanDebt(loan({ startDate: "2027-01-01" }), -1000, "2026-10-04").monthsElapsed).toBe(0);
	});
});

describe("payoffCharts", () => {
	const plan = { interest: 6, startDate: "2026-04-01" };
	const a = loanDebt(loan({ name: "Car A", termMonths: 12, ...plan, originalCents: 2000000 }), -1000000, "2026-10-04");
	const b = loanDebt(loan({ name: "Car B", termMonths: 6, ...plan }), -500000, "2026-10-04");
	const house = loanDebt(loan({ name: "House", loanKind: "mortgage", termMonths: 60, ...plan }), -9000000, "2026-10-04");
	const unplanned = loanDebt(loan({ name: "Loose", loanKind: "student" }), -100000, "2026-10-04");

	it("makes one chart per loan kind and skips loans that cannot be projected", () => {
		const charts = payoffCharts([a, b, house, unplanned], "2026-10-04");
		expect(charts.map((c) => c.kind)).toEqual(["mortgage", "car"]);
	});

	it("runs each chart to the kind's last payoff, starting this month", () => {
		const car = payoffCharts([a, b], "2026-10-04")[0];
		expect(car.months[0]).toBe("2026-10");
		expect(car.months).toHaveLength(a.projection!.payoffMonths + 1);
		expect(car.months[car.months.length - 1]).toBe("2027-04");
	});

	it("pads a loan that ends sooner with zeros and carries the colour and original amount", () => {
		const car = payoffCharts([a, b], "2026-10-04")[0];
		const early = car.series.find((s) => s.name === "Car B")!;
		expect(early.balances).toHaveLength(car.months.length);
		expect(early.balances[early.balances.length - 1]).toBe(0);
		expect(early.originalCents).toBeNull();
		expect(car.series.find((s) => s.name === "Car A")).toMatchObject({ color: "#378add", originalCents: 2000000 });
	});

	it("rolls the months over a year end", () => {
		const long = loanDebt(loan({ termMonths: 24, ...plan }), -100000, "2026-11-04");
		expect(payoffCharts([long], "2026-11-04")[0].months.slice(0, 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
	});
});

describe("extra payment", () => {
	it("zero extra gives exactly the plain schedule", () => {
		expect(projectLoan(1000000, 6, 12, 0)).toEqual(projectLoan(1000000, 6, 12));
	});

	it("pays off sooner and pays less interest", () => {
		const plain = projectLoan(1000000, 6, 24);
		const faster = projectLoan(1000000, 6, 24, 20000);
		expect(faster.payoffMonths).toBeLessThan(plain.payoffMonths);
		expect(faster.interestCents).toBeLessThan(plain.interestCents);
		expect(faster.balances[faster.balances.length - 1]).toBe(0);
	});

	it("loanDebt keeps the plain schedule as baseline", () => {
		const base = { interest: 6, termMonths: 24, startDate: "2026-10-01" };
		const none = loanDebt(loan(base), -1000000, "2026-10-04");
		const extra = loanDebt(loan({ ...base, extraPaymentCents: 20000 }), -1000000, "2026-10-04");
		expect(none.projection).toEqual(none.baseline);
		expect(extra.baseline).toEqual(none.baseline);
		expect(extra.projection!.payoffMonths).toBeLessThan(extra.baseline!.payoffMonths);
	});
});
