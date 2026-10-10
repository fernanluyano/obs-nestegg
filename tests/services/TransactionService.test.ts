import { describe, expect, it } from "vitest";
import { parseProps } from "../../notes/frontmatter";
import { monthPath } from "../../notes/paths";
import { accountBalances } from "../../snapshot/queries";
import { validateSnapshot } from "../../validation/validate";
import { LedgerError } from "../../services/errors";
import type { LedgerEntry } from "../../domain/types";
import { monthInput, tx } from "../helpers/fixtures";
import { addMortgage, loadedLedger } from "../helpers/ledgerFixture";

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
	account: "Cash Main", date: "2026-10-03", merchant: " Publix ", subcategory: "Groceries",
	amountCents: -8450, note: "", tags: ["Weekly", "weekly", "#Gift"], fromTo: "", ...over,
});

const transfer = (over = {}) => ({
	date: "2026-10-05", merchant: "", subcategory: "Account transfer", cents: 5000,
	note: "", tags: [], from: "Cash Main", to: "Savings", ...over,
});

const rows = (ledger: Awaited<ReturnType<typeof loadedLedger>>["ledger"], account: string, month = "2026-10") =>
	ledger.snapshot.months.find((m) => m.account === account && m.month === month)?.transactions ?? [];

const balance = (ledger: Awaited<ReturnType<typeof loadedLedger>>["ledger"], name: string) =>
	accountBalances(ledger.snapshot).find((b) => b.account.name === name)!.balanceCents;

describe("add", () => {
	it("creates the month file on first use, tidies merchant and tags, and syncs the balance", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.transactions.add(entry());

		expect(vault.exists(monthPath("Cash Main", "2026-10"))).toBe(true);
		expect(rows(ledger, "Cash Main")).toEqual([
			{ date: "2026-10-03", merchant: "Publix", subcategory: "Groceries", amountCents: -8450, note: "", tags: ["weekly", "gift"], fromTo: "" },
		]);
		expect(ledger.snapshot.accounts.find((a) => a.account.name === "Cash Main")!.account.balanceCents).toBe(200000 - 8450);
		expect(parseProps(vault.files.get("Nestegg/Accounts/Cash Main/Cash Main.md")!).balanceCents).toBe(200000 - 8450);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("appends to an existing month and updates the totals", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(entry());
		await ledger.transactions.add(entry({ subcategory: "Salary", amountCents: 100000, date: "2026-10-04" }));
		expect(rows(ledger, "Cash Main")).toHaveLength(2);
		const month = ledger.snapshot.months[0];
		expect(month.stored).toEqual({ incomeCents: 100000, expenseCents: 8450 });
	});

	it("uses a month file that exists on disk but is not yet in the snapshot", async () => {
		const { ledger, vault } = await loadedLedger();
		vault.files.set(monthPath("Cash Main", "2026-10"), monthInput("Cash Main", "2026-10", [tx({ note: "other" })]).content);
		expect(rows(ledger, "Cash Main")).toEqual([]);
		await ledger.transactions.add(entry());
		expect(rows(ledger, "Cash Main").map((r) => r.note)).toEqual(["other", ""]);
	});

	it("refuses invalid entries without touching the vault", async () => {
		const { ledger, vault } = await loadedLedger();
		const before = new Map(vault.files);
		for (const bad of [{ date: "nope" }, { account: "Nope" }, { subcategory: "Nope" }, { subcategory: "Account transfer" }, { amountCents: 1.5 }]) {
			await expect(ledger.transactions.add(entry(bad))).rejects.toThrow(LedgerError);
		}
		expect(vault.files).toEqual(before);
	});
});

describe("addTransfer", () => {
	it("writes both rows and refreshes both balances", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.addTransfer(transfer());
		expect(rows(ledger, "Cash Main")[0]).toMatchObject({ amountCents: -5000, fromTo: "Savings" });
		expect(rows(ledger, "Savings")[0]).toMatchObject({ amountCents: 5000, fromTo: "Cash Main" });
		expect(balance(ledger, "Cash Main")).toBe(195000);
		expect(balance(ledger, "Savings")).toBe(205000);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("takes the first row back if the second cannot be written", async () => {
		const { ledger, vault } = await loadedLedger();
		vault.failOn("create", monthPath("Savings", "2026-10"));
		await expect(ledger.transactions.addTransfer(transfer())).rejects.toThrow(/create failed/);
		await ledger.reload();
		expect(rows(ledger, "Cash Main")).toEqual([]);
	});

	it("refuses invalid transfers", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.transactions.addTransfer(transfer({ to: "Cash Main" }))).rejects.toThrow(LedgerError);
		await expect(ledger.transactions.addTransfer(transfer({ cents: 0 }))).rejects.toThrow(LedgerError);
	});

	it("pays a credit card down", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(entry({ account: "Card", amountCents: -3000 }));
		await ledger.transactions.addTransfer(transfer({ subcategory: "Credit card payment", to: "Card", cents: 1000 }));
		expect(balance(ledger, "Card")).toBe(-2000);
	});

	it("refuses a transfer out of a debt account, and a plain row on a loan", async () => {
		const { ledger } = await loadedLedger();
		await ledger.accounts.create({ name: "Mortgage", accountType: "loan", loanKind: "mortgage", enteredBalanceCents: -20000000, enteredBalanceAsOf: "2026-10-01" });
		await expect(ledger.transactions.addTransfer(transfer({ from: "Card", to: "Savings" }))).rejects.toThrow(LedgerError);
		await expect(ledger.transactions.addTransfer(transfer({ from: "Mortgage", to: "Savings" }))).rejects.toThrow(LedgerError);
		await expect(ledger.transactions.add(entry({ account: "Mortgage" }))).rejects.toThrow(LedgerError);
	});

	it("pays a loan down by debt payment", async () => {
		const { ledger } = await loadedLedger();
		await addMortgage(ledger);
		await ledger.transactions.addTransfer(transfer({ subcategory: "Loan payment", to: "Mortgage", cents: 50000 }));
		expect(balance(ledger, "Mortgage")).toBe(-20000000 + 50000);
		expect(balance(ledger, "Cash Main")).toBe(200000 - 50000);
	});

	it("keeps transfers and debt payments apart", async () => {
		const { ledger } = await loadedLedger();
		await addMortgage(ledger);
		await expect(ledger.transactions.addTransfer(transfer({ to: "Mortgage" }))).rejects.toThrow(LedgerError);
		await expect(ledger.transactions.addTransfer(transfer({ subcategory: "Credit card payment", to: "Mortgage" }))).rejects.toThrow(LedgerError);
		await expect(ledger.transactions.addTransfer(transfer({ subcategory: "Loan payment", to: "Savings" }))).rejects.toThrow(LedgerError);
		await expect(ledger.transactions.addTransfer(transfer({ subcategory: "Loan payment", to: "Card" }))).rejects.toThrow(LedgerError);
	});

	it("keeps a debt payment on the loan its subcategory is linked to", async () => {
		const { ledger } = await loadedLedger();
		await addMortgage(ledger);
		await addMortgage(ledger, "Car");
		await ledger.accounts.update("Car", { paymentSubcategory: "Loan payment" });
		await expect(ledger.transactions.addTransfer(transfer({ subcategory: "Loan payment", to: "Mortgage" }))).rejects.toThrow(LedgerError);
		await ledger.transactions.addTransfer(transfer({ subcategory: "Loan payment", to: "Car" }));
		expect(balance(ledger, "Car")).toBe(-20000000 + 5000);
	});
});

describe("update", () => {
	it("replaces a row in place within the same month and re-syncs the balance", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(entry());
		const old = { ...rows(ledger, "Cash Main")[0], account: "Cash Main" };
		await ledger.transactions.update(old, { ...old, amountCents: -1000, note: "fixed" });
		expect(rows(ledger, "Cash Main")).toHaveLength(1);
		expect(rows(ledger, "Cash Main")[0]).toMatchObject({ amountCents: -1000, note: "fixed" });
		expect(balance(ledger, "Cash Main")).toBe(199000);
	});

	it("moves a row to another month", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(entry());
		const old = { ...rows(ledger, "Cash Main")[0], account: "Cash Main" };
		await ledger.transactions.update(old, { ...old, date: "2026-11-02" });
		expect(rows(ledger, "Cash Main", "2026-10")).toEqual([]);
		expect(rows(ledger, "Cash Main", "2026-11")).toHaveLength(1);
	});

	it("moves a row to another account and updates both balances", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(entry());
		const old = { ...rows(ledger, "Cash Main")[0], account: "Cash Main" };
		await ledger.transactions.update(old, { ...old, account: "Savings" });
		expect(balance(ledger, "Cash Main")).toBe(200000);
		expect(balance(ledger, "Savings")).toBe(200000 - 8450);
	});

	it("puts the old row back if the new one cannot be written", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.transactions.add(entry());
		const old = { ...rows(ledger, "Cash Main")[0], account: "Cash Main" };
		vault.failOn("create", monthPath("Cash Main", "2026-11"));
		await expect(ledger.transactions.update(old, { ...old, date: "2026-11-02" })).rejects.toThrow(/create failed/);
		await ledger.reload();
		expect(rows(ledger, "Cash Main")).toHaveLength(1);
	});

	it("fails clearly when the row has since disappeared", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(entry());
		const ghost = { ...entry(), merchant: "Ghost", tags: [] };
		await expect(ledger.transactions.update(ghost, { ...ghost, note: "x" })).rejects.toThrow(/not found/);
		await expect(ledger.transactions.update({ ...ghost, date: "2026-12-01" }, { ...ghost, note: "x", date: "2026-12-01" })).rejects.toThrow(/no longer in the file/);
	});

	it("refuses an invalid replacement", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(entry());
		const old = { ...rows(ledger, "Cash Main")[0], account: "Cash Main" };
		await expect(ledger.transactions.update(old, { ...old, subcategory: "Nope" })).rejects.toThrow(LedgerError);
	});
});

describe("updateTransfer / delete", () => {
	async function withTransfer() {
		const fixture = await loadedLedger();
		await fixture.ledger.transactions.addTransfer(transfer());
		const out = { ...rows(fixture.ledger, "Cash Main")[0], account: "Cash Main" };
		return { ...fixture, out };
	}

	it("rewrites both rows of a transfer", async () => {
		const { ledger, out } = await withTransfer();
		await ledger.transactions.updateTransfer(out, transfer({ cents: 7000, to: "Card", subcategory: "Credit card payment" }));
		expect(rows(ledger, "Cash Main")).toHaveLength(1);
		expect(rows(ledger, "Savings")).toEqual([]);
		expect(rows(ledger, "Card")[0]).toMatchObject({ amountCents: 7000, fromTo: "Cash Main" });
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("restores the old rows if the replacement cannot be written", async () => {
		const { ledger, vault, out } = await withTransfer();
		vault.failOn("create", monthPath("Card", "2026-10"));
		await expect(ledger.transactions.updateTransfer(out, transfer({ to: "Card", subcategory: "Credit card payment" }))).rejects.toThrow(/create failed/);
		await ledger.reload();
		expect(rows(ledger, "Cash Main")).toHaveLength(1);
		expect(rows(ledger, "Savings")).toHaveLength(1);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("refuses an invalid replacement before removing anything", async () => {
		const { ledger, out } = await withTransfer();
		await expect(ledger.transactions.updateTransfer(out, transfer({ to: "Cash Main" }))).rejects.toThrow(LedgerError);
		expect(rows(ledger, "Savings")).toHaveLength(1);
	});

	it("deleting a transfer row removes its partner too", async () => {
		const { ledger, out } = await withTransfer();
		await ledger.transactions.delete(out);
		expect(rows(ledger, "Cash Main")).toEqual([]);
		expect(rows(ledger, "Savings")).toEqual([]);
		expect(balance(ledger, "Cash Main")).toBe(200000);
		expect(balance(ledger, "Savings")).toBe(200000);
	});

	it("deleting the receiving side also removes the sender", async () => {
		const { ledger } = await withTransfer();
		const inn = { ...rows(ledger, "Savings")[0], account: "Savings" };
		await ledger.transactions.delete(inn);
		expect(rows(ledger, "Cash Main")).toEqual([]);
	});

	it("deletes just the row when the partner is already gone", async () => {
		const { ledger, vault, out } = await withTransfer();
		vault.files.set(monthPath("Savings", "2026-10"), monthInput("Savings", "2026-10", []).content);
		await ledger.reload();
		await ledger.transactions.delete(out);
		expect(rows(ledger, "Cash Main")).toEqual([]);
		expect(rows(ledger, "Savings")).toEqual([]);
	});

	it("puts the first row back if its partner cannot be removed", async () => {
		const { ledger, vault, out } = await withTransfer();
		vault.failOn("modify", monthPath("Savings", "2026-10"));
		await expect(ledger.transactions.delete(out)).rejects.toThrow(/modify failed/);
		await ledger.reload();
		expect(rows(ledger, "Cash Main")).toHaveLength(1);
	});

	it("deletes an ordinary row", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(entry());
		await ledger.transactions.delete({ ...rows(ledger, "Cash Main")[0], account: "Cash Main" });
		expect(rows(ledger, "Cash Main")).toEqual([]);
		expect(balance(ledger, "Cash Main")).toBe(200000);
	});
});

describe("save", () => {
	const plain = () => ({ kind: "entry" as const, entry: entry() });
	const asTransfer = () => ({ kind: "transfer" as const, input: transfer() });
	const first = (ledger: Awaited<ReturnType<typeof loadedLedger>>["ledger"]) => ({ ...rows(ledger, "Cash Main")[0], account: "Cash Main" });

	it("creates a plain row or a transfer when there is nothing to replace", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.save(null, plain());
		await ledger.transactions.save(null, asTransfer());
		expect(rows(ledger, "Cash Main")).toHaveLength(2);
		expect(rows(ledger, "Savings")).toHaveLength(1);
	});

	it("updates a plain row with a plain draft and a transfer with a transfer draft", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.save(null, plain());
		await ledger.transactions.save(first(ledger), { kind: "entry", entry: entry({ amountCents: -1 }) });
		expect(rows(ledger, "Cash Main")[0].amountCents).toBe(-1);

		await ledger.transactions.save(null, asTransfer());
		const out = { ...rows(ledger, "Cash Main")[1], account: "Cash Main" };
		await ledger.transactions.save(out, { kind: "transfer", input: transfer({ cents: 9000 }) });
		expect(rows(ledger, "Savings")[0].amountCents).toBe(9000);
	});

	it("turns a plain row into a transfer", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.save(null, plain());
		await ledger.transactions.save(first(ledger), asTransfer());
		expect(rows(ledger, "Cash Main")).toHaveLength(1);
		expect(rows(ledger, "Cash Main")[0].fromTo).toBe("Savings");
		expect(rows(ledger, "Savings")).toHaveLength(1);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("turns a transfer into a plain row, removing both transfer rows", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.save(null, asTransfer());
		await ledger.transactions.save(first(ledger), plain());
		expect(rows(ledger, "Cash Main")).toHaveLength(1);
		expect(rows(ledger, "Cash Main")[0].fromTo).toBe("");
		expect(rows(ledger, "Savings")).toEqual([]);
		expect(balance(ledger, "Savings")).toBe(200000);
	});

	it("leaves a transfer intact if its removal fails when changing kind", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.transactions.save(null, asTransfer());
		vault.failOn("modify", monthPath("Cash Main", "2026-10"));
		await expect(ledger.transactions.save(first(ledger), plain())).rejects.toThrow(/modify failed/);
		await ledger.reload();
		expect(rows(ledger, "Cash Main")).toHaveLength(1);
		expect(rows(ledger, "Savings")).toHaveLength(1);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("restores a transfer if its partner removal fails when changing kind", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.transactions.save(null, asTransfer());
		vault.failOn("modify", monthPath("Savings", "2026-10"));
		await expect(ledger.transactions.save(first(ledger), plain())).rejects.toThrow(/modify failed/);
		await ledger.reload();
		expect(rows(ledger, "Cash Main")).toHaveLength(1);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("rolls back when inserting after the removal fails", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.transactions.save(null, plain());
		const old = first(ledger);
		vault.failOn("create", monthPath("Savings", "2026-10"));
		await expect(ledger.transactions.save(old, asTransfer())).rejects.toThrow(/create failed/);
		await ledger.reload();
		expect(rows(ledger, "Cash Main")).toHaveLength(1);
		expect(rows(ledger, "Cash Main")[0].fromTo).toBe("");
	});

	it("refuses an invalid draft before removing anything", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.save(null, plain());
		const old = first(ledger);
		await expect(ledger.transactions.save(old, { kind: "transfer", input: transfer({ to: "Cash Main" }) })).rejects.toThrow(LedgerError);
		await expect(ledger.transactions.save(old, { kind: "entry", entry: entry({ subcategory: "Nope" }) })).rejects.toThrow(LedgerError);
		expect(rows(ledger, "Cash Main")).toHaveLength(1);
	});
});

describe("running balance cache", () => {
	const warm = (ledger: Awaited<ReturnType<typeof loadedLedger>>["ledger"], months: string[]) =>
		months.forEach((m) => ledger.store.monthDeltas.get(ledger.snapshot, m));

	it("drops only the month a transaction was written to", async () => {
		const { ledger } = await loadedLedger();
		warm(ledger, ["2026-09", "2026-10"]);
		await ledger.transactions.add(entry());
		expect(ledger.store.monthDeltas.has("2026-09")).toBe(true);
		expect(ledger.store.monthDeltas.has("2026-10")).toBe(false);
	});

	it("drops both months when an edit moves a row across months", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(entry());
		warm(ledger, ["2026-09", "2026-10", "2026-11"]);
		await ledger.transactions.update({ ...rows(ledger, "Cash Main")[0], account: "Cash Main" }, entry({ date: "2026-11-02" }));
		expect(ledger.store.monthDeltas.has("2026-09")).toBe(true);
		expect(ledger.store.monthDeltas.has("2026-10")).toBe(false);
		expect(ledger.store.monthDeltas.has("2026-11")).toBe(false);
	});

	it("wipes every month when an account is edited", async () => {
		const { ledger } = await loadedLedger();
		warm(ledger, ["2026-09", "2026-10"]);
		await ledger.accounts.update("Cash Main", { enteredBalanceCents: 1 });
		expect(ledger.store.monthDeltas.has("2026-09")).toBe(false);
		expect(ledger.store.monthDeltas.has("2026-10")).toBe(false);
	});
});

describe("setBalanceShown", () => {
	it("persists a boolean property that defaults to true and survives row edits", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.transactions.add(entry());
		const path = monthPath("Cash Main", "2026-10");
		expect(ledger.snapshot.months[0].showBalance).toBe(true);

		await ledger.transactions.setBalanceShown("Cash Main", "2026-10", false);
		expect(parseProps(vault.files.get(path)!).showBalance).toBe(false);
		expect(ledger.snapshot.months[0].showBalance).toBe(false);

		await ledger.transactions.add(entry({ merchant: "Shell" }));
		expect(ledger.snapshot.months[0].showBalance).toBe(false);

		await ledger.transactions.setBalanceShown("Cash Main", "2026-10", true);
		expect(ledger.snapshot.months[0].showBalance).toBe(true);
	});

	it("refuses an account with no file that month", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.transactions.setBalanceShown("Cash Main", "2026-10", false)).rejects.toThrow(LedgerError);
	});
});
