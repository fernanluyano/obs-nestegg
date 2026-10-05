// Derived from Penny Wallet's WalletFile.ts (MIT) — see NOTICE.
import type { MonthSummary, Transaction, TransactionType } from "./types";

const TRANSACTION_TYPES: readonly string[] = ["expense", "income", "transfer"];

const TABLE_HEADER = `| Date | Type | Wallet | From | To | Category | Note | Tags | AmountCents | CreatedAt |
|------|------|--------|------|----|----------|------|------|-------------|-----------|`;

const COLUMN_COUNT = 10;
const INTEGER_RE = /^-?\d+$/;

export function parseRow(line: string): Transaction | null {
	const cols = line.split("|").map((c) => c.trim());
	cols.shift();
	cols.pop();
	if (cols.length !== COLUMN_COUNT) return null;
	const [date, type, wallet, from, to, category, note, tags, amount, createdAt] = cols;
	if (!date || !TRANSACTION_TYPES.includes(type)) return null;

	if (!INTEGER_RE.test(amount)) return null;
	const amountCents = Number(amount);
	if (!Number.isSafeInteger(amountCents)) return null;

	const orUndefined = (v: string) => (v === "-" || v === "" ? undefined : v);
	const tagList = orUndefined(tags)?.split(",").filter((t) => t.length > 0);

	return {
		date,
		type: type as TransactionType,
		wallet: orUndefined(wallet),
		fromWallet: orUndefined(from),
		toWallet: orUndefined(to),
		category: orUndefined(category),
		note: note === "-" ? "" : note,
		tags: tagList?.length ? tagList : undefined,
		amountCents,
		createdAt: orUndefined(createdAt),
	};
}

export function formatRow(tx: Transaction): string {
	const cols = [
		tx.date,
		tx.type,
		tx.wallet ?? "-",
		tx.fromWallet ?? "-",
		tx.toWallet ?? "-",
		tx.category ?? "-",
		tx.note || "-",
		tx.tags?.length ? tx.tags.join(",") : "-",
		tx.amountCents,
		tx.createdAt ?? "-",
	];
	return `| ${cols.join(" | ")} |`;
}

export function parseMonthFile(content: string): Transaction[] {
	const transactions: Transaction[] = [];
	let inTable = false;

	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!inTable) {
			inTable = trimmed.startsWith("| Date");
			continue;
		}
		if (trimmed.startsWith("|---")) continue;
		// A blank line ends the table so notes below it are never parsed as rows.
		if (!trimmed.startsWith("|")) break;
		const tx = parseRow(trimmed);
		if (tx) transactions.push(tx);
	}
	return transactions;
}

export function summarize(transactions: Transaction[]): MonthSummary {
	let incomeCents = 0;
	let expenseCents = 0;
	for (const tx of transactions) {
		if (tx.type === "income") incomeCents += tx.amountCents;
		else if (tx.type === "expense") expenseCents += tx.amountCents;
	}
	return { incomeCents, expenseCents };
}

export function buildMonthContent(yearMonth: string, transactions: Transaction[]): string {
	const { incomeCents, expenseCents } = summarize(transactions);
	const frontmatter = `---\nincomeCents: ${incomeCents}\nexpenseCents: ${expenseCents}\n---\n`;
	const rows = transactions.map(formatRow).join("\n");
	return `${frontmatter}\n## ${yearMonth}\n\n${TABLE_HEADER}${rows ? "\n" + rows : ""}\n`;
}

export function parseFrontmatter(content: string): Partial<MonthSummary> {
	const match = /^---\n([\s\S]*?)\n---/.exec(content);
	if (!match) return {};
	const read = (key: string): number | undefined => {
		const m = new RegExp(`^${key}:\\s*(-?\\d+)\\s*$`, "m").exec(match[1]);
		return m ? Number(m[1]) : undefined;
	};
	return { incomeCents: read("incomeCents"), expenseCents: read("expenseCents") };
}
