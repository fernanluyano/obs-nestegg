// Derived from Penny Wallet's WalletFile.ts (MIT) — see NOTICE.
import { summarize } from "./transactionTable";
import type {
	FrontmatterIssue,
	OrphanedWalletIssue,
	Transaction,
	Wallet,
	WalletBalance,
} from "./types";

export function compareTransactions(a: Transaction, b: Transaction): number {
	const d = a.date.localeCompare(b.date);
	return d !== 0 ? d : (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
}

export function findTransactionIndex(transactions: Transaction[], target: Transaction): number {
	return transactions.findIndex(
		(tx) =>
			tx.date === target.date &&
			tx.type === target.type &&
			tx.amountCents === target.amountCents &&
			tx.note === target.note &&
			(tx.wallet ?? "") === (target.wallet ?? "") &&
			(tx.fromWallet ?? "") === (target.fromWallet ?? "") &&
			(tx.toWallet ?? "") === (target.toWallet ?? "") &&
			(tx.category ?? "") === (target.category ?? "") &&
			(tx.tags ?? []).join(",") === (target.tags ?? []).join(",") &&
			(tx.createdAt === undefined || target.createdAt === undefined || tx.createdAt === target.createdAt),
	);
}

export function initialBalances(wallets: Wallet[]): Map<string, number> {
	return new Map(wallets.map((w) => [w.name, w.initialBalanceCents]));
}

// Credit-card balances are debt owed: spending raises them, payments lower them.
export function applyTransaction(tx: Transaction, balances: Map<string, number>, wallets: Wallet[]): void {
	const bump = (name: string | undefined, delta: number) => {
		if (name && balances.has(name)) balances.set(name, (balances.get(name) ?? 0) + delta);
	};
	const isCard = (name: string | undefined) => wallets.find((w) => w.name === name)?.type === "creditCard";

	switch (tx.type) {
		case "expense":
			bump(tx.wallet, isCard(tx.wallet) ? tx.amountCents : -tx.amountCents);
			break;
		case "income":
			bump(tx.wallet, tx.amountCents);
			break;
		case "transfer":
			bump(tx.fromWallet, -tx.amountCents);
			bump(tx.toWallet, isCard(tx.toWallet) ? -tx.amountCents : tx.amountCents);
			break;
	}
}

export function computeWalletBalances(wallets: Wallet[], transactions: Transaction[]): WalletBalance[] {
	const balances = initialBalances(wallets);
	for (const tx of transactions) applyTransaction(tx, balances, wallets);
	return wallets.map((wallet) => ({
		wallet,
		balanceCents: balances.get(wallet.name) ?? wallet.initialBalanceCents,
	}));
}

export function computeNetAssetFromMap(wallets: Wallet[], balances: Map<string, number>): number {
	let net = 0;
	for (const w of wallets) {
		if (!w.includeInNetAsset) continue;
		const balance = balances.get(w.name) ?? 0;
		net += w.type === "creditCard" ? -balance : balance;
	}
	return net;
}

export function computeNetAsset(walletBalances: WalletBalance[]): number {
	let net = 0;
	for (const { wallet, balanceCents } of walletBalances) {
		if (!wallet.includeInNetAsset) continue;
		net += wallet.type === "creditCard" ? -balanceCents : balanceCents;
	}
	return net;
}

export function groupByCategory(transactions: Transaction[], type: "expense" | "income"): Map<string, number> {
	const map = new Map<string, number>();
	for (const tx of transactions) {
		if (tx.type !== type) continue;
		const key = tx.category ?? "";
		map.set(key, (map.get(key) ?? 0) + tx.amountCents);
	}
	return map;
}

export function renameWallet(transactions: Transaction[], oldName: string, newName: string): Transaction[] {
	const swap = (name: string | undefined) => (name === oldName ? newName : name);
	return transactions.map((tx) => ({
		...tx,
		wallet: swap(tx.wallet),
		fromWallet: swap(tx.fromWallet),
		toWallet: swap(tx.toWallet),
	}));
}

export function detectFrontmatterIssues(
	yearMonth: string,
	transactions: Transaction[],
	stored: { incomeCents: number; expenseCents: number },
): FrontmatterIssue[] {
	const actual = summarize(transactions);
	if (actual.incomeCents === stored.incomeCents && actual.expenseCents === stored.expenseCents) return [];
	return [
		{
			type: "frontmatter",
			yearMonth,
			storedIncomeCents: stored.incomeCents,
			storedExpenseCents: stored.expenseCents,
			actualIncomeCents: actual.incomeCents,
			actualExpenseCents: actual.expenseCents,
		},
	];
}

export function detectOrphanedWallets(
	monthData: Map<string, Transaction[]>,
	wallets: Wallet[],
): OrphanedWalletIssue[] {
	const known = new Set(wallets.map((w) => w.name));
	const orphans = new Map<string, { count: number; months: Set<string> }>();

	for (const [ym, txs] of monthData) {
		for (const tx of txs) {
			for (const name of [tx.wallet, tx.fromWallet, tx.toWallet]) {
				if (!name || known.has(name)) continue;
				const entry = orphans.get(name) ?? { count: 0, months: new Set<string>() };
				entry.count++;
				entry.months.add(ym);
				orphans.set(name, entry);
			}
		}
	}

	return [...orphans.entries()].map(([walletName, { count, months }]) => ({
		type: "orphanedWallet" as const,
		walletName,
		transactionCount: count,
		yearMonths: [...months].sort(),
	}));
}
