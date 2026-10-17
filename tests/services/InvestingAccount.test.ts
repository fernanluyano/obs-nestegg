import { describe, expect, it } from "vitest";
import { balanceAt, currentBalance } from "../../domain/accounts";
import { readValuations } from "../../notes/assetNote";
import { parseProps } from "../../notes/frontmatter";
import { accountPath } from "../../notes/paths";
import { assetsBreakdown, cashOnHandTimeline, findAccount, investingTotal, netWorthStartMonth, netWorthTimeline } from "../../snapshot/queries";
import { validateSnapshot } from "../../validation/validate";
import { loadedLedger } from "../helpers/ledgerFixture";

const input = { name: "Brokerage", accountType: "investing" as const, enteredBalanceCents: 1000000, enteredBalanceAsOf: "2026-07-31" };

async function ledgerWithBrokerage() {
	const loaded = await loadedLedger();
	await loaded.ledger.accounts.create(input);
	return loaded;
}

const rowsOf = (vault: { files: Map<string, string> }) => readValuations(vault.files.get(accountPath("Brokerage"))!).valuations;
const propsOf = (vault: { files: Map<string, string> }) => parseProps(vault.files.get(accountPath("Brokerage"))!);

describe("create", () => {
	it("writes the first entry as a table row and reads it back", async () => {
		const { ledger, vault } = await ledgerWithBrokerage();
		expect(rowsOf(vault)).toEqual([{ date: "2026-07-31", valueCents: 1000000, note: "" }]);
		expect(findAccount(ledger.snapshot, "Brokerage")?.valuations).toEqual(rowsOf(vault));
		expect(currentBalance(findAccount(ledger.snapshot, "Brokerage")!, [])).toBe(1000000);
	});

	it("refuses a negative first value", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.accounts.create({ ...input, enteredBalanceCents: -1 })).rejects.toThrow(/zero or more/);
	});
});

describe("entries", () => {
	it("adds an entry in date order and keeps the balance properties on the latest one", async () => {
		const { ledger, vault } = await ledgerWithBrokerage();
		await ledger.accounts.addEntry("Brokerage", { date: "2026-09-30", valueCents: 1200000, note: " rally " });
		await ledger.accounts.addEntry("Brokerage", { date: "2026-08-31", valueCents: 1100000, note: "" });
		expect(rowsOf(vault).map((r) => r.date)).toEqual(["2026-07-31", "2026-08-31", "2026-09-30"]);
		expect(rowsOf(vault)[2].note).toBe("rally");
		expect(propsOf(vault)).toMatchObject({ enteredBalanceCents: 1200000, enteredBalanceAsOf: "2026-09-30", balanceCents: 1200000 });
	});

	it("replaces the entry of a date that already has one", async () => {
		const { ledger, vault } = await ledgerWithBrokerage();
		await ledger.accounts.addEntry("Brokerage", { date: "2026-07-31", valueCents: 900000, note: "" });
		expect(rowsOf(vault)).toEqual([{ date: "2026-07-31", valueCents: 900000, note: "" }]);
	});

	it("edits an entry, its date included, and refuses a date another entry holds", async () => {
		const { ledger, vault } = await ledgerWithBrokerage();
		await ledger.accounts.addEntry("Brokerage", { date: "2026-08-31", valueCents: 1100000, note: "" });
		await ledger.accounts.editEntry("Brokerage", "2026-08-31", { date: "2026-08-15", valueCents: 1150000, note: "fixed" });
		expect(rowsOf(vault)).toEqual([
			{ date: "2026-07-31", valueCents: 1000000, note: "" },
			{ date: "2026-08-15", valueCents: 1150000, note: "fixed" },
		]);
		await expect(ledger.accounts.editEntry("Brokerage", "2026-08-15", { date: "2026-07-31", valueCents: 1, note: "" })).rejects.toThrow(/already an entry/);
		expect(propsOf(vault)).toMatchObject({ enteredBalanceCents: 1150000, enteredBalanceAsOf: "2026-08-15" });
	});

	it("edits an entry in place when its date is unchanged", async () => {
		const { ledger, vault } = await ledgerWithBrokerage();
		await ledger.accounts.editEntry("Brokerage", "2026-07-31", { date: "2026-07-31", valueCents: 5, note: "" });
		expect(rowsOf(vault)).toEqual([{ date: "2026-07-31", valueCents: 5, note: "" }]);
	});

	it("removes an entry and moves the balance back to the latest one left", async () => {
		const { ledger, vault } = await ledgerWithBrokerage();
		await ledger.accounts.addEntry("Brokerage", { date: "2026-08-31", valueCents: 7700000, note: "typo" });
		await ledger.accounts.removeEntry("Brokerage", "2026-08-31");
		expect(rowsOf(vault)).toEqual([{ date: "2026-07-31", valueCents: 1000000, note: "" }]);
		expect(propsOf(vault)).toMatchObject({ enteredBalanceCents: 1000000, enteredBalanceAsOf: "2026-07-31", balanceCents: 1000000 });
	});

	it("keeps the last entry, and refuses an entry that does not exist", async () => {
		const { ledger, vault } = await ledgerWithBrokerage();
		const before = new Map(vault.files);
		await expect(ledger.accounts.removeEntry("Brokerage", "2026-07-31")).rejects.toThrow(/at least one entry/);
		await expect(ledger.accounts.removeEntry("Brokerage", "2020-01-01")).rejects.toThrow(/no entry dated/);
		expect(vault.files).toEqual(before);
	});

	it("rejects bad dates and values, other account types and a typed balance", async () => {
		const { ledger } = await ledgerWithBrokerage();
		await expect(ledger.accounts.addEntry("Brokerage", { date: "nope", valueCents: 1, note: "" })).rejects.toThrow(/date/);
		await expect(ledger.accounts.addEntry("Brokerage", { date: "2026-08-01", valueCents: -1, note: "" })).rejects.toThrow(/zero or more/);
		await expect(ledger.accounts.addEntry("Savings", { date: "2026-08-01", valueCents: 1, note: "" })).rejects.toThrow(/Only an investing account/);
		await expect(ledger.accounts.update("Brokerage", { enteredBalanceCents: 5 })).rejects.toThrow(/entries/);
	});
});

describe("balance and net worth", () => {
	it("is the latest entry on or before a date, and zero before the first", async () => {
		const { ledger } = await ledgerWithBrokerage();
		await ledger.accounts.addEntry("Brokerage", { date: "2026-09-15", valueCents: 1300000, note: "" });
		const account = findAccount(ledger.snapshot, "Brokerage")!;
		expect(balanceAt(account, [], "2026-07-30")).toBe(0);
		expect(balanceAt(account, [], "2026-08-31")).toBe(1000000);
		expect(balanceAt(account, [], "2026-09-30")).toBe(1300000);
	});

	it("counts toward assets and net worth, but not toward cash on hand", async () => {
		const { ledger } = await ledgerWithBrokerage();
		const months = ["2026-07", "2026-09"];
		const worth = netWorthTimeline(ledger.snapshot, months);
		const cash = cashOnHandTimeline(ledger.snapshot, months);
		expect(worth.get("2026-07")!.assetsCents - cash.get("2026-07")!).toBe(1000000);
		expect(worth.get("2026-07")!.liabilitiesCents).toBe(0);
	});

	it("starts net worth at the first entry, not the latest", async () => {
		const { ledger } = await loadedLedger();
		await ledger.accounts.create({ ...input, enteredBalanceAsOf: "2020-03-31" });
		await ledger.accounts.addEntry("Brokerage", { date: "2026-09-15", valueCents: 1300000, note: "" });
		expect(netWorthStartMonth(ledger.snapshot)! <= "2020-03").toBe(true);
	});
});

describe("investing total", () => {
	it("adds every active investing account into one total", async () => {
		const { ledger } = await ledgerWithBrokerage();
		await ledger.accounts.create({ ...input, name: "IRA", enteredBalanceCents: 500000, enteredBalanceAsOf: "2026-08-31" });
		await ledger.accounts.addEntry("Brokerage", { date: "2026-09-30", valueCents: 1200000, note: "" });
		expect(investingTotal(ledger.snapshot)).toEqual({ cents: 1700000, count: 2 });
		await ledger.accounts.setActive("IRA", false);
		expect(investingTotal(ledger.snapshot)).toEqual({ cents: 1200000, count: 1 });
	});

	it("is a slice of the assets breakdown next to the asset types", async () => {
		const { ledger } = await ledgerWithBrokerage();
		await ledger.assets.create({ name: "House", assetType: "house", valueCents: 300000, date: "2026-07-01" });
		expect([...assetsBreakdown(ledger.snapshot)]).toEqual([["label.assetType.house", 300000], ["investing.title", 1000000]]);
	});

	it("is null without an investing account", async () => {
		const { ledger } = await loadedLedger();
		expect(investingTotal(ledger.snapshot)).toBeNull();
	});
});

describe("validation", () => {
	it("is clean for a fresh investing account", async () => {
		const { ledger } = await ledgerWithBrokerage();
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("reports an unreadable entry row", async () => {
		const { ledger, vault } = await ledgerWithBrokerage();
		await vault.modify(accountPath("Brokerage"), (c) => `${c.trimEnd()}\n| 2026-08-01 | lots | |\n`);
		await ledger.reload();
		expect(validateSnapshot(ledger.snapshot).some((i) => i.type === "malformedRow")).toBe(true);
	});
});
