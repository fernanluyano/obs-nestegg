import { describe, expect, it } from "vitest";
import {
	applyTransaction,
	compareTransactions,
	computeNetAsset,
	computeNetAssetFromMap,
	computeWalletBalances,
	detectFrontmatterIssues,
	detectOrphanedWallets,
	findTransactionIndex,
	groupByCategory,
	initialBalances,
	renameWallet,
} from "../ledger";
import type { Transaction, Wallet } from "../types";

const wallets: Wallet[] = [
	{ name: "Checking", type: "bank", initialBalanceCents: 100000, status: "active", includeInNetAsset: true },
	{ name: "Cash", type: "cash", initialBalanceCents: 5000, status: "active", includeInNetAsset: true },
	{ name: "Visa", type: "creditCard", initialBalanceCents: 20000, status: "active", includeInNetAsset: true },
];

const tx = (over: Partial<Transaction>): Transaction => ({
	date: "04/01",
	type: "expense",
	note: "",
	amountCents: 0,
	...over,
});

describe("applyTransaction", () => {
	it("expense lowers a bank balance and raises card debt", () => {
		const b = initialBalances(wallets);
		applyTransaction(tx({ wallet: "Checking", amountCents: 2500 }), b, wallets);
		applyTransaction(tx({ wallet: "Visa", amountCents: 1000 }), b, wallets);
		expect(b.get("Checking")).toBe(97500);
		expect(b.get("Visa")).toBe(21000);
	});

	it("refund (negative expense) reverses it", () => {
		const b = initialBalances(wallets);
		applyTransaction(tx({ wallet: "Visa", amountCents: -1500 }), b, wallets);
		expect(b.get("Visa")).toBe(18500);
	});

	it("income raises the balance", () => {
		const b = initialBalances(wallets);
		applyTransaction(tx({ type: "income", wallet: "Checking", amountCents: 300000 }), b, wallets);
		expect(b.get("Checking")).toBe(400000);
	});

	it("transfer moves money between wallets", () => {
		const b = initialBalances(wallets);
		applyTransaction(tx({ type: "transfer", fromWallet: "Checking", toWallet: "Cash", amountCents: 1999 }), b, wallets);
		expect(b.get("Checking")).toBe(98001);
		expect(b.get("Cash")).toBe(6999);
	});

	it("credit card payment lowers both the paying wallet and the card debt", () => {
		const b = initialBalances(wallets);
		applyTransaction(
			tx({ type: "transfer", category: "credit_card_payment", fromWallet: "Checking", toWallet: "Visa", amountCents: 20000 }),
			b,
			wallets,
		);
		expect(b.get("Checking")).toBe(80000);
		expect(b.get("Visa")).toBe(0);
	});

	it("ignores unknown wallets", () => {
		const b = initialBalances(wallets);
		applyTransaction(tx({ wallet: "Gone", amountCents: 100 }), b, wallets);
		expect([...b.keys()]).toEqual(["Checking", "Cash", "Visa"]);
	});
});

describe("net asset", () => {
	it("subtracts card debt", () => {
		expect(computeNetAsset(computeWalletBalances(wallets, []))).toBe(100000 + 5000 - 20000);
	});

	it("skips wallets excluded from net asset", () => {
		const archived = wallets.map((w) => (w.name === "Cash" ? { ...w, includeInNetAsset: false } : w));
		expect(computeNetAsset(computeWalletBalances(archived, []))).toBe(100000 - 20000);
	});

	it("computeNetAssetFromMap agrees with computeNetAsset", () => {
		const txs = [tx({ wallet: "Checking", amountCents: 123 }), tx({ wallet: "Visa", amountCents: 456 })];
		const map = initialBalances(wallets);
		txs.forEach((t) => applyTransaction(t, map, wallets));
		expect(computeNetAssetFromMap(wallets, map)).toBe(computeNetAsset(computeWalletBalances(wallets, txs)));
	});
});

describe("groupByCategory", () => {
	it("sums per category for one type", () => {
		const txs = [
			tx({ category: "food", amountCents: 100 }),
			tx({ category: "food", amountCents: 250 }),
			tx({ category: "fees", amountCents: 7 }),
			tx({ type: "income", category: "salary", amountCents: 9999 }),
		];
		expect(groupByCategory(txs, "expense")).toEqual(new Map([["food", 350], ["fees", 7]]));
	});
});

describe("renameWallet", () => {
	it("rewrites every wallet reference", () => {
		const out = renameWallet(
			[tx({ wallet: "A" }), tx({ type: "transfer", fromWallet: "A", toWallet: "B" })],
			"A",
			"Z",
		);
		expect(out[0].wallet).toBe("Z");
		expect(out[1].fromWallet).toBe("Z");
		expect(out[1].toWallet).toBe("B");
	});
});

describe("ordering and lookup", () => {
	it("orders by date then createdAt", () => {
		const a = tx({ date: "04/02", createdAt: "1" });
		const b = tx({ date: "04/01", createdAt: "2" });
		const c = tx({ date: "04/01", createdAt: "1" });
		expect([a, b, c].sort(compareTransactions)).toEqual([c, b, a]);
	});

	it("finds a transaction by its fields", () => {
		const list = [tx({ amountCents: 1 }), tx({ amountCents: 2, note: "x" })];
		expect(findTransactionIndex(list, tx({ amountCents: 2, note: "x" }))).toBe(1);
		expect(findTransactionIndex(list, tx({ amountCents: 3 }))).toBe(-1);
	});
});

describe("validation", () => {
	it("flags frontmatter that disagrees with the rows", () => {
		const txs = [tx({ amountCents: 500 }), tx({ type: "income", amountCents: 900 })];
		expect(detectFrontmatterIssues("2026-04", txs, { incomeCents: 900, expenseCents: 500 })).toEqual([]);
		const issues = detectFrontmatterIssues("2026-04", txs, { incomeCents: 0, expenseCents: 500 });
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({ storedIncomeCents: 0, actualIncomeCents: 900 });
	});

	it("reports wallets that are not configured", () => {
		const data = new Map([
			["2026-04", [tx({ wallet: "Ghost" }), tx({ wallet: "Checking" })]],
			["2026-05", [tx({ type: "transfer", fromWallet: "Ghost", toWallet: "Cash" })]],
		]);
		expect(detectOrphanedWallets(data, wallets)).toEqual([
			{ type: "orphanedWallet", walletName: "Ghost", transactionCount: 2, yearMonths: ["2026-04", "2026-05"] },
		]);
	});
});
