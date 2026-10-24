import { loanSchedule } from "./accounts";
import type { Account, LoanKind } from "./types";
import { LOAN_KINDS } from "./types";

export interface LoanProjection {
	paymentCents: number; // the standard level payment that clears the balance over the remaining term
	extraCents: number; // paid on top of paymentCents every month; zero when none
	balances: number[]; // owed at the end of each month; index 0 is now, the last entry is zero
	payoffMonths: number;
	interestCents: number; // total interest paid until payoff
}

export interface LoanDebt {
	account: Account;
	owedCents: number; // positive; debts are stored negative
	percentPaid: number | null; // null until the loan has an original amount
	monthsElapsed: number | null; // null until the loan has a start date
	projection: LoanProjection | null; // null while interest, term or start date is missing; includes the extra payment
	baseline: LoanProjection | null; // the same loan without the extra payment, to show what it saves
}

export interface PayoffSeries {
	name: string;
	color: string;
	originalCents: number | null; // lets the chart work out % paid at any month, not only now
	balances: number[]; // aligned with the chart's months, zero once paid off
}

export interface PayoffChart {
	kind: LoanKind;
	months: string[]; // YYYY-MM, the current month first
	series: PayoffSeries[];
}

const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;

function addMonths(yearMonth: string, delta: number): string {
	const index = monthIndex(yearMonth) + delta;
	return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

// Standard amortizing payment, to whole cents. An interest-free loan is just an even split.
export function standardPaymentCents(owedCents: number, interestPercent: number, months: number): number {
	const rate = interestPercent / 100 / 12;
	if (rate === 0) return Math.round(owedCents / months);
	return Math.round((owedCents * rate) / (1 - Math.pow(1 + rate, -months)));
}

// Month by month, rounding the interest to cents each time. The last month absorbs the rounding
// drift, so the loan always ends at exactly zero.
// An extra payment is added to the standard one every month; zero gives the plain schedule.
export function projectLoan(owedCents: number, interestPercent: number, months: number, extraCents = 0): LoanProjection {
	const paymentCents = standardPaymentCents(owedCents, interestPercent, months);
	const rate = interestPercent / 100 / 12;
	const balances = [owedCents];
	let balance = owedCents;
	let interestCents = 0;
	for (let month = 1; month <= months; month++) {
		const interest = Math.round(balance * rate);
		interestCents += interest;
		balance += interest - paymentCents - extraCents;
		if (balance <= 0 || month === months) balance = 0;
		balances.push(balance);
		if (balance === 0) break;
	}
	return { paymentCents, extraCents, balances, payoffMonths: balances.length - 1, interestCents };
}

// Share of the original amount already paid, 0 to 100 with one decimal.
export function percentPaid(originalCents: number | undefined, owedCents: number): number | null {
	if (originalCents === undefined) return null;
	const paid = (1 - owedCents / originalCents) * 100;
	return Math.round(Math.min(100, Math.max(0, paid)) * 10) / 10;
}

export function loanDebt(account: Account, balanceCents: number, today: string): LoanDebt {
	const owedCents = Math.max(0, -balanceCents);
	const schedule = loanSchedule(account, today);
	const projectable = owedCents > 0 && account.interest !== undefined && schedule !== null;
	const months = projectable ? Math.max(1, schedule.monthsLeft) : 0;
	const extraCents = account.extraPaymentCents ?? 0;
	const baseline = projectable ? projectLoan(owedCents, account.interest!, months) : null;
	return {
		account,
		owedCents,
		percentPaid: percentPaid(account.originalCents, owedCents),
		monthsElapsed: account.startDate === undefined ? null : Math.max(0, monthIndex(today) - monthIndex(account.startDate)),
		// A loan past its term that still owes money is shown as one final month.
		projection: baseline && extraCents > 0 ? projectLoan(owedCents, account.interest!, months, extraCents) : baseline,
		baseline,
	};
}

// One chart per loan kind with the loans stacked, each running to the kind's last payoff.
export function payoffCharts(loans: LoanDebt[], today: string): PayoffChart[] {
	const charts: PayoffChart[] = [];
	for (const kind of LOAN_KINDS) {
		const projected = loans.filter((l) => l.account.loanKind === kind && l.projection);
		if (projected.length === 0) continue;
		const last = Math.max(...projected.map((l) => l.projection!.payoffMonths));
		const start = today.slice(0, 7);
		charts.push({
			kind,
			months: Array.from({ length: last + 1 }, (_, i) => addMonths(start, i)),
			series: projected.map((l) => ({
				name: l.account.name,
				color: l.account.color,
				originalCents: l.account.originalCents ?? null,
				balances: Array.from({ length: last + 1 }, (_, i) => l.projection!.balances[i] ?? 0),
			})),
		});
	}
	return charts;
}
