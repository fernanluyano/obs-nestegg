export type TransactionType = "expense" | "income" | "transfer";
export type AccountType = "cash" | "creditCard";

export const TRANSACTION_TYPES: readonly TransactionType[] = ["expense", "income", "transfer"];
export const ACCOUNT_TYPES: readonly AccountType[] = ["cash", "creditCard"];

export interface Account {
	name: string;
	accountType: AccountType;
	active: boolean;
	includeInNetAsset: boolean; // active accounts always count; an inactive one can be toggled
	enteredBalanceCents: number; // checkpoint only the user changes; creditCard: positive = debt owed
	enteredBalanceAsOf: string; // YYYY-MM-DD the entered balance applies to
	balanceCents: number; // cache of the current balance, recomputed on every write
	color: string; // #rrggbb, how the account is told apart in lists and legends
}

export interface Category {
	name: string;
	categoryType: TransactionType;
	subcategories: string[];
}

export interface Settings {
	defaultAccount: string;
	autoValidateOnLoad: boolean;
}

// One table row. `amountCents` is signed from the owning account's point of view.
export interface Transaction {
	date: string; // YYYY-MM-DD
	merchant: string;
	subcategory: string;
	amountCents: number;
	note: string;
	tags: string[];
	fromTo: string; // other account of a transfer row, empty otherwise
}

// A transaction plus the account whose month file holds it.
export interface LedgerEntry extends Transaction {
	account: string;
}

export interface MonthSummary {
	incomeCents: number;
	expenseCents: number;
}

export interface AccountBalance {
	account: Account;
	balanceCents: number; // creditCard: positive = debt owed (shown negative in net asset)
}

export interface TransactionModalParams {
	type?: TransactionType;
	amountCents?: number;
	note?: string;
	tags?: string[];
	subcategory?: string;
	merchant?: string;
	account?: string;
	fromAccount?: string;
	toAccount?: string;
	date?: string; // yyyy-mm-dd
}
