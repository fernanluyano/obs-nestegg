import type { MonthSummary } from "../domain/types";
import type { NoteKind } from "../notes/kinds";

export interface MonthTotalsIssue {
	type: "monthTotals";
	path: string;
	account: string;
	month: string;
	stored: Partial<MonthSummary>;
	actual: MonthSummary;
}

export interface AccountBalanceIssue {
	type: "accountBalance";
	path: string;
	account: string;
	storedCents: number;
	actualCents: number;
}

export interface AccountAvailableIssue {
	type: "accountAvailable";
	path: string;
	account: string;
	storedCents: number;
	actualCents: number;
}

// More is set aside in buckets than the account holds (or the balance itself is below zero).
export interface NegativeAvailableIssue {
	type: "negativeAvailable";
	account: string;
	availableCents: number;
	balanceCents: number;
	bucketsCents: number;
}

export interface MalformedRowIssue {
	type: "malformedRow";
	path: string;
	line: number;
	reason: string;
	text: string;
}

export interface OrphanedAccountIssue {
	type: "orphanedAccount";
	account: string;
	transactionCount: number;
	months: string[];
}

export interface DuplicateNameIssue {
	type: "duplicateName";
	kind: "account" | "category" | "asset";
	name: string;
	paths: string[];
}

export interface DuplicateMonthIssue {
	type: "duplicateMonth";
	account: string;
	month: string;
	paths: string[];
}

export interface DuplicateSubcategoryIssue {
	type: "duplicateSubcategory";
	subcategory: string;
	categories: string[];
}

export interface UnknownSubcategoryIssue {
	type: "unknownSubcategory";
	subcategory: string;
	transactionCount: number;
	months: string[];
}

export type TransferProblem = "noPartner" | "missingFromTo" | "sameAccount" | "fromToOnNonTransfer";

export interface TransferIssue {
	type: "transfer";
	problem: TransferProblem;
	path: string;
	account: string;
	date: string;
	fromTo: string;
	amountCents: number;
}

export interface PathMismatchIssue {
	type: "pathMismatch";
	kind: NoteKind;
	path: string;
	expectedPath: string;
}

export interface InTransitIssue {
	type: "inTransit";
	kind: NoteKind;
	path: string;
	transitFor?: string;
}

export interface InvalidNoteIssue {
	type: "invalidNote";
	kind: NoteKind;
	path: string;
	reason: string;
}

export interface InvalidDefaultAccountIssue {
	type: "invalidDefaultAccount";
	path: string;
	defaultAccount: string;
}

export type ValidationIssue =
	| MonthTotalsIssue
	| AccountBalanceIssue
	| AccountAvailableIssue
	| NegativeAvailableIssue
	| MalformedRowIssue
	| OrphanedAccountIssue
	| DuplicateNameIssue
	| DuplicateMonthIssue
	| DuplicateSubcategoryIssue
	| UnknownSubcategoryIssue
	| TransferIssue
	| PathMismatchIssue
	| InTransitIssue
	| InvalidNoteIssue
	| InvalidDefaultAccountIssue;
