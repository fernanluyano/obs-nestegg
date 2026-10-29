// A transfer moves money between two cash accounts; a debt payment moves it from a cash account
// to a credit card or loan. Both are written as two linked rows.
export type TransactionType = "expense" | "income" | "transfer" | "debt";
import type { Valuation } from "./assets";

export type AccountType = "cash" | "creditCard" | "loan" | "investing";
export type LoanKind = "student" | "mortgage" | "car" | "personal" | "other";

export const TRANSACTION_TYPES: readonly TransactionType[] = ["expense", "income", "transfer", "debt"];

// Types written as two rows, one in each account.
export const isTransferLike = (type: TransactionType | undefined): boolean => type === "transfer" || type === "debt";
export const ACCOUNT_TYPES: readonly AccountType[] = ["cash", "creditCard", "loan", "investing"];
export const LOAN_KINDS: readonly LoanKind[] = ["student", "mortgage", "car", "personal", "other"];

// Credit cards and loans: money owed, stored as a negative balance.
export const isLiability = (type: AccountType): boolean => type === "creditCard" || type === "loan";

// Valued by hand from dated entries instead of replayed from transactions; takes no transactions.
export const isInvesting = (type: AccountType): boolean => type === "investing";

// Every other type has rows; the transaction pickers, filters and running balances list only these.
export const takesTransactions = (type: AccountType): boolean => !isInvesting(type);

export interface Account {
	name: string;
	accountType: AccountType;
	active: boolean;
	includeInNetAsset: boolean; // active accounts always count; an inactive one can be toggled
	enteredBalanceCents: number; // checkpoint only the user changes; debt accounts hold it negative
	enteredBalanceAsOf: string; // YYYY-MM-DD the entered balance applies to
	balanceCents: number; // cache of the current balance, recomputed on every write
	availableCents?: number; // cash only: cache of the balance minus what its buckets hold; absent reads as the balance
	color: string; // #rrggbb, how the account is told apart in lists and legends
	unbalancedCents?: number; // set when the user saved a correction that disagreed with their known balance: our balance minus theirs, so nonzero when present
	loanKind?: LoanKind; // loan only, always present there
	termMonths?: number; // loan only: original term, whole months >= 1
	startDate?: string; // loan only: YYYY-MM-DD the loan began
	interest?: number; // loan only: percent, up to two decimals, not negative
	originalCents?: number; // loan only: the amount first borrowed, positive; progress is measured against it
	extraPaymentCents?: number; // loan only: optional extra paid on top of the standard payment every month; absent means none
	paymentSubcategory?: string; // debt accounts: the debt-payment subcategory its payments use
	valuations?: Valuation[]; // investing only: the dated entries from the note body, sorted by date; filled in when the snapshot is built
}

// A category is only a container; each subcategory carries its own type.
export interface Subcategory {
	name: string;
	type: TransactionType;
}

export interface Category {
	name: string;
	subcategories: Subcategory[];
}

// A named combination of tags the Overview's expense-by-tag chart can switch to in one click.
export interface TagSet {
	name: string;
	tags: string[];
}

export interface Settings {
	defaultAccount: string;
	autoValidateOnLoad: boolean;
	tagSets: TagSet[];
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

// One planned amount in a month's budget. Expense and income subcategories only; the category
// is found through the category index, so a category rename never touches a budget.
export interface BudgetLine {
	subcategory: string;
	plannedCents: number;
}

export interface MonthSummary {
	incomeCents: number;
	expenseCents: number;
}

export interface AccountBalance {
	account: Account;
	balanceCents: number; // debt accounts: negative
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
