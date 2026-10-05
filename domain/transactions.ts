import type { CategoryIndex } from "./categories";
import type { LedgerEntry, MonthSummary, Transaction, TransactionType } from "./types";

export function typeOf(tx: Transaction, index: CategoryIndex): TransactionType | undefined {
	return index.typeOf(tx.subcategory);
}

// Income is the sum of income-category amounts; expense is the negated sum of expense-category
// amounts, so a refund (positive, under an expense subcategory) nets the total down.
// Transfers and unknown subcategories count in neither.
export function summarize(transactions: Transaction[], index: CategoryIndex): MonthSummary {
	let incomeCents = 0;
	let expenseCents = 0;
	for (const tx of transactions) {
		const type = index.typeOf(tx.subcategory);
		if (type === "income") incomeCents += tx.amountCents;
		else if (type === "expense") expenseCents -= tx.amountCents;
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
	cents: number;
	note: string;
	tags: string[];
	from: string;
	to: string;
}

// What the entry form produces: one plain row, or the input for a two-row transfer.
export type TransactionDraft =
	| { kind: "entry"; entry: LedgerEntry }
	| { kind: "transfer"; input: TransferInput };

// Each account's file must be correct from its own point of view, so a transfer is two rows:
// money leaves `from` (negative) and arrives in `to` (positive); FromTo names the other side.
export function transferEntries(input: TransferInput): [LedgerEntry, LedgerEntry] {
	const base = {
		date: input.date,
		merchant: input.merchant,
		subcategory: input.subcategory,
		note: input.note,
		tags: input.tags,
	};
	return [
		{ ...base, account: input.from, amountCents: -input.cents, fromTo: input.to },
		{ ...base, account: input.to, amountCents: input.cents, fromTo: input.from },
	];
}

// The other half of a transfer row: same date and subcategory, opposite amount, pointing back.
export function isPartnerRow(row: LedgerEntry, candidate: LedgerEntry): boolean {
	return (
		candidate.account === row.fromTo &&
		candidate.fromTo === row.account &&
		candidate.date === row.date &&
		candidate.subcategory === row.subcategory &&
		candidate.amountCents === -row.amountCents
	);
}
