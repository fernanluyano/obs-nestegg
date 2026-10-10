import { isIsoDate } from "./dates";
import { parseCents } from "./money";
import { isLiability, LOAN_KINDS, type Account, type AccountBalance, type AccountType, type Transaction } from "./types";

// A typed balance is stored as typed: cash is zero or more, and a debt is zero or less, so what
// is owed is entered negative. Catches the likeliest slip, typing a debt as a positive amount.
export function balanceSignProblem(type: AccountType, cents: number): "cashNegative" | "debtPositive" | null {
	if (isLiability(type)) return cents > 0 ? "debtPositive" : null;
	return cents < 0 ? "cashNegative" : null;
}

// Three decimals, because mortgage rates are quoted like 4.875.
const INTEREST_RE = /^\d+(\.\d{1,3})?$/;

// The payment-plan fields of a loan, each optional but valid when present; null when all are fine.
export function loanFieldProblem(fields: Pick<Account, "loanKind" | "termMonths" | "startDate" | "interest" | "originalCents" | "extraPaymentCents">): string | null {
	if (fields.loanKind !== undefined && !LOAN_KINDS.includes(fields.loanKind)) return "The loan kind is not valid";
	if (fields.termMonths !== undefined && (!Number.isSafeInteger(fields.termMonths) || fields.termMonths < 1)) return "The term must be a whole number of months, at least 1";
	if (fields.startDate !== undefined && !isIsoDate(fields.startDate)) return "The start date is not a valid date";
	if (fields.interest !== undefined && !INTEREST_RE.test(String(fields.interest))) return "The interest must be a percent of zero or more with up to three decimals";
	if (fields.originalCents !== undefined && (!Number.isSafeInteger(fields.originalCents) || fields.originalCents < 1)) return "The original amount must be more than zero";
	if (fields.extraPaymentCents !== undefined && (!Number.isSafeInteger(fields.extraPaymentCents) || fields.extraPaymentCents < 0)) return "The extra payment must be zero or more";
	return null;
}

// The text a loan's plan fields are typed as, read once for both the Add form and the edit modal.
// Blank means not set; anything else must be valid, with the message to show when it is not.
export type PlanFieldsText = { termMonths: string; startDate: string; interest: string; originalAmount?: string };
export type PlanFieldsParse =
	| { ok: true; fields: Pick<Account, "termMonths" | "startDate" | "interest" | "originalCents"> }
	| { ok: false; error: "term" | "start" | "interest" | "original" };

export function parsePlanFields(text: PlanFieldsText): PlanFieldsParse {
	const fields: Pick<Account, "termMonths" | "startDate" | "interest" | "originalCents"> = {};
	const term = text.termMonths.trim();
	if (term !== "") {
		fields.termMonths = /^\d+$/.test(term) ? Number(term) : NaN;
		if (loanFieldProblem({ termMonths: fields.termMonths })) return { ok: false, error: "term" };
	}
	const start = text.startDate.trim();
	if (start !== "") {
		if (!isIsoDate(start)) return { ok: false, error: "start" };
		fields.startDate = start;
	}
	const interest = text.interest.trim();
	if (interest !== "") {
		fields.interest = Number(interest);
		if (!INTEREST_RE.test(interest)) return { ok: false, error: "interest" };
	}
	const original = (text.originalAmount ?? "").trim();
	if (original !== "") {
		const cents = parseCents(original);
		if (cents === null || loanFieldProblem({ originalCents: cents })) return { ok: false, error: "original" };
		fields.originalCents = cents;
	}
	return { ok: true, fields };
}

export interface LoanSchedule {
	endMonth: string; // YYYY-MM of the last scheduled month
	monthsLeft: number; // whole months from `today`'s month to the end, never below zero
}

const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;

// The scheduled end of a loan: its start month plus the original term. Nothing is stored for it,
// so it stays right as time passes. Null while the loan lacks a start date or a term.
export function loanSchedule(account: Pick<Account, "startDate" | "termMonths">, today: string): LoanSchedule | null {
	if (account.startDate === undefined || account.termMonths === undefined) return null;
	const end = monthIndex(account.startDate) + account.termMonths;
	const endMonth = `${String(Math.floor(end / 12)).padStart(4, "0")}-${String((end % 12) + 1).padStart(2, "0")}`;
	return { endMonth, monthsLeft: Math.max(0, end - monthIndex(today)) };
}

function sumAmounts(transactions: Transaction[], keep: (date: string) => boolean): number {
	let sum = 0;
	for (const tx of transactions) if (keep(tx.date)) sum += tx.amountCents;
	return sum;
}

// Balance at the end of `date`, replaying forward or backward from the entered checkpoint,
// so a correction dated mid-history still yields the right balance on both sides of it.
export function balanceAt(account: Account, transactions: Transaction[], date: string): number {
	const asOf = account.enteredBalanceAsOf;
	if (date >= asOf) {
		const delta = sumAmounts(transactions, (d) => d > asOf && d <= date);
		return account.enteredBalanceCents + delta;
	}
	const delta = sumAmounts(transactions, (d) => d > date && d <= asOf);
	return account.enteredBalanceCents - delta;
}

// Current balance: the entered balance plus everything dated after it, with no upper bound.
export function currentBalance(account: Account, transactions: Transaction[]): number {
	return account.enteredBalanceCents + sumAmounts(transactions, (d) => d > account.enteredBalanceAsOf);
}

export function netAssetCents(balances: AccountBalance[]): number {
	let net = 0;
	for (const { account, balanceCents } of balances) if (account.includeInNetAsset) net += balanceCents;
	return net;
}
