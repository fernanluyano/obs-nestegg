// Derived from Penny Wallet (MIT) — see NOTICE.
export type TransactionType = "expense" | "income" | "transfer";
export type WalletType = "cash" | "bank" | "creditCard";

export interface Transaction {
	date: string; // MM/DD as stored in the month file
	type: TransactionType;
	wallet?: string; // expense / income
	fromWallet?: string; // transfer
	toWallet?: string; // transfer
	category?: string; // default categories stored as key (e.g. "food"), custom as raw string
	note: string;
	tags?: string[];
	amountCents: number; // negative for refunds
	createdAt?: string; // ISO 8601; orders same-day rows
}

export interface Wallet {
	name: string;
	type: WalletType;
	initialBalanceCents: number; // creditCard: positive = debt owed
	status: "active" | "archived";
	includeInNetAsset: boolean; // active wallets always true; archived can be toggled
}

export interface MonthSummary {
	incomeCents: number;
	expenseCents: number;
}

export interface WalletBalance {
	wallet: Wallet;
	balanceCents: number; // creditCard: positive = debt owed (shown negative in net asset)
}

export interface OptionsListGroup {
	default: string[]; // built-in, immutable
	custom: string[]; // user-defined
}

export interface NesteggOptions {
	types: OptionsListGroup;
	categories: {
		expense: OptionsListGroup;
		income: OptionsListGroup;
		transfer: OptionsListGroup;
	};
}

export interface NesteggConfig {
	wallets: Wallet[];
	defaultWallet: string;
	folderName: string;
	options: NesteggOptions;
	tags: string[];
	autoValidateOnLoad: boolean;
}

export interface TransactionModalParams {
	type?: TransactionType;
	amountCents?: number;
	note?: string;
	tags?: string[];
	category?: string;
	wallet?: string;
	fromWallet?: string;
	toWallet?: string;
	date?: string; // yyyy-mm-dd
}

export const DEFAULT_EXPENSE_CATEGORIES = [
	"food", "clothing", "housing", "transport", "education",
	"entertainment", "shopping", "medical", "cash_expense",
	"insurance", "fees", "tax",
] as const;

export const DEFAULT_INCOME_CATEGORIES = [
	"salary", "interest", "side_income", "bonus", "lottery",
	"rent", "cashback", "dividend", "investment_profit",
	"insurance_income", "pension",
] as const;

export const DEFAULT_TRANSFER_CATEGORIES = [
	"account_transfer", "credit_card_payment",
	"investment_trade",
] as const;

export const DEFAULT_CONFIG: NesteggConfig = {
	wallets: [
		{
			name: "Cash",
			type: "cash",
			initialBalanceCents: 0,
			status: "active",
			includeInNetAsset: true,
		},
	],
	defaultWallet: "Cash",
	folderName: "Nestegg",
	options: {
		types: { default: ["expense", "income", "transfer"], custom: [] },
		categories: {
			expense: { default: [...DEFAULT_EXPENSE_CATEGORIES], custom: [] },
			income: { default: [...DEFAULT_INCOME_CATEGORIES], custom: [] },
			transfer: { default: [...DEFAULT_TRANSFER_CATEGORIES], custom: [] },
		},
	},
	tags: [],
	autoValidateOnLoad: true,
};

export interface FrontmatterIssue {
	type: "frontmatter";
	yearMonth: string;
	storedIncomeCents: number;
	storedExpenseCents: number;
	actualIncomeCents: number;
	actualExpenseCents: number;
}

export interface OrphanedWalletIssue {
	type: "orphanedWallet";
	walletName: string;
	transactionCount: number;
	yearMonths: string[];
}

export type ValidationIssue = FrontmatterIssue | OrphanedWalletIssue;
