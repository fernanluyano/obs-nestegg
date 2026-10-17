import type { CategoryIndex } from "./categories";
import { formatCents } from "./money";
import type { LedgerEntry, MonthSummary, Transaction, TransactionType } from "./types";

export function typeOf(tx: Transaction, index: CategoryIndex): TransactionType | undefined {
	return index.typeOf(tx.subcategory);
}

// Income is the sum of income-category amounts; expense is the negated sum of expense-category
// amounts, so a refund (positive, under an expense subcategory) nets the total down. A debt payment
// is spending too, counted once: only its outgoing row (negative, in the cash account) counts, never
// the matching positive row that lands on the loan. Transfers and unknown subcategories count in neither.
export function summarize(transactions: Transaction[], index: CategoryIndex): MonthSummary {
	let incomeCents = 0;
	let expenseCents = 0;
	for (const tx of transactions) {
		const type = index.typeOf(tx.subcategory);
		if (type === "income") incomeCents += tx.amountCents;
		else if (type === "expense" || (type === "debt" && tx.amountCents < 0)) expenseCents -= tx.amountCents;
	}
	return { incomeCents, expenseCents };
}

export function sameTransaction(a: Transaction, b: Transaction): boolean {
	return (
		a.date === b.date &&
		a.merchant === b.merchant &&
		a.subcategory === b.subcategory &&
		a.amountCents === b.amountCents &&
		a.note === b.note &&
		a.fromTo === b.fromTo &&
		a.tags.join(",") === b.tags.join(",")
	);
}

export function findTransactionIndex(transactions: Transaction[], target: Transaction): number {
	return transactions.findIndex((tx) => sameTransaction(tx, target));
}

// The form shows a positive amount and a type; the file stores the sign.
// Expense money leaves (negative) unless it is a refund; income always arrives.
export function signedAmount(type: "expense" | "income", cents: number, isRefund: boolean): number {
	if (type === "income" || isRefund || cents === 0) return cents;
	return -cents;
}

export interface SplitAmount {
	cents: number; // always >= 0
	isRefund: boolean; // positive amount under an expense subcategory
}

export function splitAmount(type: TransactionType, amountCents: number): SplitAmount {
	const cents = Math.abs(amountCents);
	return { cents, isRefund: type === "expense" && amountCents > 0 };
}

export interface TransferInput {
	date: string;
	merchant: string;
	subcategory: string;
	cents: number; // what arrives in `to`; for a loan payment, the principal
	interestCents?: number; // loan payments only: interest paid on top of `cents`, leaves `from` but never reaches the loan
	note: string;
	tags: string[];
	from: string;
	to: string;
}

// What the entry form produces: one plain row, or the input for a two-row transfer.
export type TransactionDraft =
	| { kind: "entry"; entry: LedgerEntry }
	| { kind: "transfer"; input: TransferInput };

// The loan row of a payment that included interest carries this note, so the row explains why it is
// smaller than what left the cash account. It is data in the vault, not a UI label.
const INTEREST_NOTE_PREFIX = "does not include the interest amount of ";
const INTEREST_NOTE_SUFFIX = ", principal only";
const INTEREST_NOTE_PATTERN = new RegExp(`(?:^|; )${INTEREST_NOTE_PREFIX}[\\d,]+\\.\\d{2}${INTEREST_NOTE_SUFFIX}$`);

export function interestNote(interestCents: number): string {
	return `${INTEREST_NOTE_PREFIX}${formatCents(interestCents)}${INTEREST_NOTE_SUFFIX}`;
}

// The user's own note with the interest note after it, as one string.
function withInterestNote(note: string, interestCents: number): string {
	return note === "" ? interestNote(interestCents) : `${note}; ${interestNote(interestCents)}`;
}

// Takes the automatic interest note back off, so editing a payment does not stack a second one.
export function stripInterestNote(note: string): string {
	return note.replace(INTEREST_NOTE_PATTERN, "");
}

// Each account's file must be correct from its own point of view, so a transfer is two rows:
// money leaves `from` (negative) and arrives in `to` (positive); FromTo names the other side.
// A loan payment with interest leaves `from` as principal plus interest but lowers the loan by the
// principal only, so the two rows differ by the interest and the loan row says so in its note.
export function transferEntries(input: TransferInput): [LedgerEntry, LedgerEntry] {
	const interest = input.interestCents ?? 0;
	const base = {
		date: input.date,
		merchant: input.merchant,
		subcategory: input.subcategory,
		note: input.note,
		tags: input.tags,
	};
	return [
		{ ...base, account: input.from, amountCents: -(input.cents + interest), fromTo: input.to },
		{ ...base, account: input.to, amountCents: input.cents, fromTo: input.from, note: interest > 0 ? withInterestNote(input.note, interest) : input.note },
	];
}

// The other half of a transfer row: same date and subcategory, pointing back. A transfer's halves
// are exact opposites. A loan payment's halves are told apart by merchant instead, and the money
// that left may exceed what reached the loan: the difference is the interest.
export function isPartnerRow(row: LedgerEntry, candidate: LedgerEntry, loanPayment = false): boolean {
	const sameFacts =
		candidate.account === row.fromTo &&
		candidate.fromTo === row.account &&
		candidate.date === row.date &&
		candidate.subcategory === row.subcategory;
	if (!sameFacts) return false;
	if (!loanPayment) return candidate.amountCents === -row.amountCents;
	if (candidate.merchant !== row.merchant) return false;
	const [out, arrived] = row.amountCents < 0 ? [row, candidate] : [candidate, row];
	return out.amountCents < 0 && arrived.amountCents > 0 && -out.amountCents >= arrived.amountCents;
}

// Interest paid in a loan payment: what left the cash account minus what reached the loan.
export function interestOf(cashRow: LedgerEntry, loanRow: LedgerEntry): number {
	return -cashRow.amountCents - loanRow.amountCents;
}

// Two rows on the same side of the same loan payment, so their order in the file tells them apart.
export function sameLoanLeg(a: LedgerEntry, b: LedgerEntry): boolean {
	return (
		a.account === b.account &&
		a.fromTo === b.fromTo &&
		a.date === b.date &&
		a.subcategory === b.subcategory &&
		a.merchant === b.merchant &&
		a.amountCents < 0 === b.amountCents < 0
	);
}
