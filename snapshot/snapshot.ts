import type { Asset, Valuation } from "../domain/assets";
import { buildCategoryIndex, type CategoryIndex } from "../domain/categories";
import type { Account, BudgetLine, Category, LedgerEntry, MonthSummary, Settings, Transaction } from "../domain/types";
import type { Bucket } from "../domain/buckets";
import { parseAccountProps } from "../notes/accountNote";
import { parseAssetProps, readValuations } from "../notes/assetNote";
import { readBuckets } from "../notes/bucketTable";
import { parseBudgetNote } from "../notes/budgetNote";
import { parseCategoryNote } from "../notes/categoryNote";
import type { RawProps } from "../notes/frontmatter";
import { kindOf, stateOf, transitForOf, type NoteKind } from "../notes/kinds";
import { parseMonthNote, type RowIssue } from "../notes/monthNote";
import { parseSettingsProps } from "../notes/settingsNote";
import type { TableIssue } from "../table/types";

// What the loader hands over for each plugin note. `content` is only read for the kinds that
// have a table body (accounts, categories, month files); the others only need their properties.
export interface NoteInput {
	path: string;
	props: RawProps;
	content: string;
}

export interface AccountRecord {
	path: string;
	account: Account;
	buckets: Bucket[]; // cash accounts only; always empty for the others
	bucketIssues: RowIssue[];
}

export interface AssetRecord {
	path: string;
	asset: Asset;
	valuations: Valuation[]; // sorted by date
	valuationIssues: RowIssue[];
}

export interface CategoryRecord {
	path: string;
	category: Category;
	tableIssues: TableIssue[];
}

export interface MonthRecord {
	path: string;
	account: string;
	month: string;
	stored: Partial<MonthSummary>;
	showBalance: boolean;
	transactions: Transaction[];
	rowIssues: RowIssue[];
}

export interface BudgetRecord {
	path: string;
	month: string;
	lines: BudgetLine[];
	rowIssues: RowIssue[];
}

export interface SettingsRecord {
	path: string;
	settings: Settings;
}

export interface TransitRecord {
	path: string;
	kind: NoteKind;
	transitFor?: string;
}

export interface InvalidNote {
	path: string;
	kind: NoteKind;
	reason: string;
}

export interface Snapshot {
	settings: SettingsRecord | null;
	accounts: AccountRecord[];
	assets: AssetRecord[];
	categories: CategoryRecord[];
	months: MonthRecord[];
	budgets: BudgetRecord[];
	transit: TransitRecord[];
	invalid: InvalidNote[];
}

export function emptySnapshot(): Snapshot {
	return { settings: null, accounts: [], assets: [], categories: [], months: [], budgets: [], transit: [], invalid: [] };
}

// Only `current` notes count toward data; staged copies are set aside for recovery. Paths are
// visited in sorted order so duplicates resolve the same way on every load.
export function buildSnapshot(inputs: NoteInput[]): Snapshot {
	const snapshot = emptySnapshot();
	const sorted = [...inputs].sort((a, b) => a.path.localeCompare(b.path));

	for (const { path, props, content } of sorted) {
		const kind = kindOf(props);
		if (!kind) continue;

		if (stateOf(props) === "in_transit") {
			snapshot.transit.push({ path, kind, transitFor: transitForOf(props) });
			continue;
		}

		switch (kind) {
			case "settings":
				snapshot.settings ??= { path, settings: parseSettingsProps(props) };
				break;
			case "account": {
				const parsed = parseAccountProps(props);
				if (parsed.ok) {
					const { buckets, issues } = parsed.account.accountType === "cash" ? readBuckets(content) : { buckets: [], issues: [] };
					snapshot.accounts.push({ path, account: parsed.account, buckets, bucketIssues: issues });
				} else snapshot.invalid.push({ path, kind, reason: parsed.reason });
				break;
			}
			case "asset": {
				const parsed = parseAssetProps(props);
				if (parsed.ok) {
					const { valuations, issues } = readValuations(content);
					snapshot.assets.push({ path, asset: parsed.asset, valuations, valuationIssues: issues });
				} else snapshot.invalid.push({ path, kind, reason: parsed.reason });
				break;
			}
			case "category": {
				const parsed = parseCategoryNote(props, content);
				if (parsed.ok) snapshot.categories.push({ path, category: parsed.category, tableIssues: parsed.tableIssues });
				else snapshot.invalid.push({ path, kind, reason: parsed.reason });
				break;
			}
			case "budget": {
				const parsed = parseBudgetNote(props, content);
				if (parsed.ok) snapshot.budgets.push({ path, month: parsed.month, lines: parsed.lines, rowIssues: parsed.rowIssues });
				else snapshot.invalid.push({ path, kind, reason: parsed.reason });
				break;
			}
			case "transactions": {
				const parsed = parseMonthNote(props, content);
				if (parsed.ok) {
					const { account, month, stored, showBalance, transactions, rowIssues } = parsed;
					snapshot.months.push({ path, account, month, stored, showBalance, transactions, rowIssues });
				} else {
					snapshot.invalid.push({ path, kind, reason: parsed.reason });
				}
				break;
			}
		}
	}
	return snapshot;
}

export function categoryIndexOf(snapshot: Snapshot): CategoryIndex {
	return buildCategoryIndex(snapshot.categories.map((c) => c.category));
}

export function entriesOf(months: MonthRecord[]): LedgerEntry[] {
	return months.flatMap((m) => m.transactions.map((tx) => ({ ...tx, account: m.account })));
}

export function accountTransactions(snapshot: Snapshot, account: string): Transaction[] {
	return snapshot.months.filter((m) => m.account === account).flatMap((m) => m.transactions);
}
