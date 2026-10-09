import { buildCategoryIndex } from "../../domain/categories";
import { DEFAULT_SETTINGS, defaultCategories } from "../../domain/defaults";
import type { Account, BudgetLine, Category, Settings, Transaction, TransactionType } from "../../domain/types";
import { buildAccountNote } from "../../notes/accountNote";
import { buildBudgetNote } from "../../notes/budgetNote";
import { buildCategoryNote } from "../../notes/categoryNote";
import { parseProps } from "../../notes/frontmatter";
import { buildMonthNote } from "../../notes/monthNote";
import { accountPath, budgetPath, categoryPath, monthPath, SETTINGS_PATH } from "../../notes/paths";
import { buildSettingsNote } from "../../notes/settingsNote";
import { buildSnapshot, type NoteInput } from "../../snapshot/snapshot";

export const index = buildCategoryIndex(defaultCategories());

// A category whose subcategories all take `type`; pass [name, type] pairs to mix types.
export const category = (name: string, type: TransactionType, subcategories: (string | [string, TransactionType])[]): Category => ({
	name,
	subcategories: subcategories.map((s) => (typeof s === "string" ? { name: s, type } : { name: s[0], type: s[1] })),
});

export const account = (over: Partial<Account> = {}): Account => ({
	name: "Cash Main",
	accountType: "cash",
	active: true,
	includeInNetAsset: true,
	enteredBalanceCents: 200000,
	enteredBalanceAsOf: "2026-10-02",
	balanceCents: 200000,
	color: "#378add",
	...over,
});

export const tx = (over: Partial<Transaction> = {}): Transaction => ({
	date: "2026-10-03",
	merchant: "Publix",
	subcategory: "Groceries",
	amountCents: -8450,
	note: "",
	tags: [],
	fromTo: "",
	...over,
});

export function inputOf(path: string, text: string): NoteInput {
	return { path, props: parseProps(text), content: text };
}

export const accountInput = (a: Account) => inputOf(accountPath(a.name), buildAccountNote(a));
export const categoryInput = (c: Category) => inputOf(categoryPath(c.name), buildCategoryNote(c));
export const settingsInput = (s: Settings = DEFAULT_SETTINGS) => inputOf(SETTINGS_PATH, buildSettingsNote(s));
export const monthInput = (acct: string, month: string, rows: Transaction[]) =>
	inputOf(monthPath(acct, month), buildMonthNote({ account: acct, month }, rows, index));

export const budgetInput = (month: string, lines: BudgetLine[]) => inputOf(budgetPath(month), buildBudgetNote(month, lines));

// A consistent little vault: one cash account, the default categories, one expense in October.
export function vaultInputs(extra: { accounts?: Account[]; months?: NoteInput[]; settings?: Settings } = {}): NoteInput[] {
	return [
		settingsInput(extra.settings ?? { defaultAccount: "Cash Main", autoValidateOnLoad: true }),
		...(extra.accounts ?? [account({ balanceCents: 200000 - 8450 })]).map(accountInput),
		...defaultCategories().map(categoryInput),
		...(extra.months ?? [monthInput("Cash Main", "2026-10", [tx()])]),
	];
}

export const snapshotOf = (inputs: NoteInput[]) => buildSnapshot(inputs);
