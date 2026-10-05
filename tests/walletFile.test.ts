import { describe, expect, it } from "vitest";
import { WalletFile } from "../io/WalletFile";
import { parseFrontmatter, parseMonthFile } from "../transactionTable";
import { DEFAULT_CONFIG } from "../types";
import type { NesteggConfig, Transaction } from "../types";
import { createMockApp } from "./helpers/mockApp";

async function makeWalletFile(initialFiles: Record<string, string> = {}, saved: unknown = { ...DEFAULT_CONFIG, folderName: "Ledgers" }) {
	const { app, store } = createMockApp(initialFiles);
	const saves: NesteggConfig[] = [];
	const wf = new WalletFile(app, { load: async () => saved, save: async (d) => { saves.push(d); } });
	await wf.loadConfig();
	return { wf, store, saves };
}

const LUNCH: Transaction = { date: "04/15", type: "expense", wallet: "Cash", category: "food", note: "Lunch", amountCents: 1550 };

describe("config", () => {
	it("creates and saves defaults on first launch", async () => {
		const { wf, saves } = await makeWalletFile({}, null);
		expect(wf.didCreateDefaultConfigOnLastLoad()).toBe(true);
		expect(wf.getConfig().wallets[0].name).toBe("Cash");
		expect(saves).toHaveLength(1);
	});

	it("keeps saved config and fills in default categories", async () => {
		const { wf } = await makeWalletFile();
		expect(wf.didCreateDefaultConfigOnLastLoad()).toBe(false);
		expect(wf.getConfig().options.categories.expense.default).toContain("food");
	});

	it("adds tags without duplicates", async () => {
		const { wf } = await makeWalletFile();
		expect(await wf.addTag("#trip")).toEqual({ ok: true });
		expect(await wf.addTag("trip")).toEqual({ ok: false, reason: "duplicate" });
		expect(await wf.addTag("  ")).toEqual({ ok: false, reason: "empty" });
	});
});

describe("month files", () => {
	it("writes integer cents to the table and frontmatter", async () => {
		const { wf, store } = await makeWalletFile();
		await wf.writeTransaction(LUNCH, "2026-04");
		const content = store.get("Ledgers/2026-04.md")!;
		expect(content).toContain("| 1550 |");
		expect(parseFrontmatter(content)).toEqual({ incomeCents: 0, expenseCents: 1550 });
		expect(parseMonthFile(content)).toHaveLength(1);
	});

	it("keeps rows sorted by date", async () => {
		const { wf } = await makeWalletFile();
		await wf.writeTransaction(LUNCH, "2026-04");
		await wf.writeTransaction({ ...LUNCH, date: "04/01", note: "Early" }, "2026-04");
		expect((await wf.readMonth("2026-04")).map((t) => t.note)).toEqual(["Early", "Lunch"]);
	});

	it("updates in place and moves across months", async () => {
		const { wf } = await makeWalletFile();
		await wf.writeTransaction(LUNCH, "2026-04");
		const [stored] = await wf.readMonth("2026-04");
		await wf.updateTransaction(stored, "2026-04", { ...stored, amountCents: 2000 }, "2026-04");
		expect((await wf.readMonth("2026-04"))[0].amountCents).toBe(2000);

		const [again] = await wf.readMonth("2026-04");
		await wf.updateTransaction(again, "2026-04", { ...again, date: "05/02" }, "2026-05");
		expect(await wf.readMonth("2026-04")).toEqual([]);
		expect(await wf.readMonth("2026-05")).toHaveLength(1);
	});

	it("deletes a transaction", async () => {
		const { wf } = await makeWalletFile();
		await wf.writeTransaction(LUNCH, "2026-04");
		await wf.deleteTransaction((await wf.readMonth("2026-04"))[0], "2026-04");
		expect(await wf.readMonth("2026-04")).toEqual([]);
	});

	it("saves transaction tags into the config", async () => {
		const { wf } = await makeWalletFile();
		await wf.writeTransaction({ ...LUNCH, tags: ["work"] }, "2026-04");
		expect(wf.getConfig().tags).toEqual(["work"]);
	});

	it("renames a wallet across months", async () => {
		const { wf } = await makeWalletFile();
		await wf.writeTransaction(LUNCH, "2026-04");
		await wf.writeTransaction({ ...LUNCH, date: "05/01" }, "2026-05");
		await wf.renameWalletInTransactions("Cash", "Wallet");
		expect((await wf.readMonth("2026-04"))[0].wallet).toBe("Wallet");
		expect((await wf.readMonth("2026-05"))[0].wallet).toBe("Wallet");
	});

	it("lists months in order", async () => {
		const { wf } = await makeWalletFile();
		await wf.writeTransaction(LUNCH, "2026-05");
		await wf.writeTransaction(LUNCH, "2026-04");
		expect(wf.getAllYearMonths()).toEqual(["2026-04", "2026-05"]);
	});
});

describe("balances and trends", () => {
	async function seeded() {
		const { wf } = await makeWalletFile();
		wf.updateConfig({
			wallets: [
				{ name: "Cash", type: "cash", initialBalanceCents: 10000, status: "active", includeInNetAsset: true },
				{ name: "Visa", type: "creditCard", initialBalanceCents: 0, status: "active", includeInNetAsset: true },
			],
		});
		await wf.writeTransaction({ ...LUNCH, date: "04/01", amountCents: 2500 }, "2026-04");
		await wf.writeTransaction({ date: "04/02", type: "expense", wallet: "Visa", note: "", amountCents: 4000 }, "2026-04");
		await wf.writeTransaction({ date: "05/03", type: "income", wallet: "Cash", note: "", amountCents: 50000 }, "2026-05");
		return wf;
	}

	it("computes balances and net asset", async () => {
		const wf = await seeded();
		const balances = await wf.calculateAllWalletBalances();
		expect(balances.map((b) => b.balanceCents)).toEqual([7500 + 50000, 4000]);
		expect(wf.computeNetAsset(balances)).toBe(57500 - 4000);
	});

	it("carries balances across months in the trends", async () => {
		const wf = await seeded();
		const net = await wf.getNetAssetTimeline(["2026-04", "2026-05"]);
		expect(net.get("2026-04")).toBe(7500 - 4000);
		expect(net.get("2026-05")).toBe(57500 - 4000);
		const trend = await wf.getWalletBalanceTrend(["2026-04", "2026-05"]);
		expect(trend.get("Cash")?.get("2026-05")).toBe(57500);
		expect(trend.has("Visa")).toBe(false);
	});

	it("reports which wallets have transactions", async () => {
		const wf = await seeded();
		expect(await wf.walletHasTransactions("Visa")).toBe(true);
		expect(await wf.walletHasTransactions("Nope")).toBe(false);
	});
});

describe("validation", () => {
	it("is clean for files the plugin wrote", async () => {
		const { wf } = await makeWalletFile();
		await wf.writeTransaction(LUNCH, "2026-04");
		expect(await wf.validateAllData()).toEqual([]);
	});

	it("detects stale frontmatter and orphaned wallets, and repairs the wallet", async () => {
		const { wf, store } = await makeWalletFile();
		await wf.writeTransaction({ ...LUNCH, wallet: "Old Bank" }, "2026-04");
		store.set("Ledgers/2026-04.md", store.get("Ledgers/2026-04.md")!.replace("expenseCents: 1550", "expenseCents: 1"));
		const issues = await wf.validateAllData();
		expect(issues.map((i) => i.type).sort()).toEqual(["frontmatter", "orphanedWallet"]);

		await wf.repairOrphanedWallet("Old Bank");
		expect(wf.getConfig().wallets.find((w) => w.name === "Old Bank")?.status).toBe("archived");
		await wf.recalculateFrontmatter("2026-04");
		expect((await wf.validateAllData()).map((i) => i.type)).toEqual([]);
	});

	it("bootstraps missing frontmatter", async () => {
		const { wf, store } = await makeWalletFile({
			"Ledgers/2026-04.md": "\n## 2026-04\n\n| Date | Type | Wallet | From | To | Category | Note | Tags | AmountCents | CreatedAt |\n|------|\n| 04/01 | expense | Cash | - | - | food | - | - | 300 | - |\n",
		});
		await wf.bootstrapFrontmatter();
		expect(parseFrontmatter(store.get("Ledgers/2026-04.md")!)).toEqual({ incomeCents: 0, expenseCents: 300 });
	});
});
