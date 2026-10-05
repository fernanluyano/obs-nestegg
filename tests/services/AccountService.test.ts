import { describe, expect, it } from "vitest";
import { parseProps } from "../../notes/frontmatter";
import { accountPath, monthPath } from "../../notes/paths";
import { findAccount } from "../../snapshot/queries";
import { LedgerError } from "../../services/errors";
import { Ledger } from "../../services/Ledger";
import { validateSnapshot } from "../../validation/validate";
import { loadedLedger } from "../helpers/ledgerFixture";
import { MemoryVault } from "../helpers/memoryVault";

const entry = { account: "Cash Main", date: "2026-10-03", merchant: "", subcategory: "Groceries", amountCents: -1000, note: "", tags: [], fromTo: "" };

describe("create", () => {
	it("writes a new active account note whose cached balance is the entered one", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.accounts.create({ name: "Brokerage", accountType: "cash", enteredBalanceCents: 12345, enteredBalanceAsOf: "2026-10-01" });
		expect(findAccount(ledger.snapshot, "Brokerage")).toMatchObject({ active: true, balanceCents: 12345, includeInNetAsset: true });
		expect(parseProps(vault.files.get(accountPath("Brokerage"))!).name).toBe("Brokerage");
	});

	it("rejects bad names, duplicates, bad dates and bad amounts", async () => {
		const { ledger } = await loadedLedger();
		const base = { name: "X", accountType: "cash" as const, enteredBalanceCents: 0, enteredBalanceAsOf: "2026-10-01" };
		await expect(ledger.accounts.create({ ...base, name: "a/b" })).rejects.toThrow(/valid account name/);
		await expect(ledger.accounts.create({ ...base, name: "Savings" })).rejects.toThrow(/already exists/);
		await expect(ledger.accounts.create({ ...base, enteredBalanceAsOf: "nope" })).rejects.toThrow(/date/);
		await expect(ledger.accounts.create({ ...base, enteredBalanceCents: 1.5 })).rejects.toThrow(/amount/);
	});
});

describe("update", () => {
	it("changes the entered balance and recomputes the cache from the rows after it", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(entry);
		await ledger.accounts.update("Cash Main", { enteredBalanceCents: 100000, enteredBalanceAsOf: "2026-10-01" });
		expect(findAccount(ledger.snapshot, "Cash Main")).toMatchObject({ enteredBalanceCents: 100000, balanceCents: 99000 });
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("moving the checkpoint past a transaction leaves the row out of the balance", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(entry);
		await ledger.accounts.update("Cash Main", { enteredBalanceAsOf: "2026-10-31" });
		expect(findAccount(ledger.snapshot, "Cash Main")!.balanceCents).toBe(200000);
	});

	it("marks an account unbalanced with a property and a tag, and a later update clears both", async () => {
		const { ledger, vault } = await loadedLedger();
		const path = accountPath("Cash Main");
		await ledger.accounts.update("Cash Main", { unbalancedCents: 4210 });
		expect(findAccount(ledger.snapshot, "Cash Main")!.unbalancedCents).toBe(4210);
		expect(parseProps(vault.files.get(path)!)).toMatchObject({ unbalancedCents: 4210, tags: ["nestegg/account", "nestegg/unbalanced"] });

		await ledger.accounts.update("Cash Main", { color: "#112233" });
		expect(findAccount(ledger.snapshot, "Cash Main")!.unbalancedCents).toBe(4210);

		await ledger.accounts.update("Cash Main", { unbalancedCents: undefined });
		expect(findAccount(ledger.snapshot, "Cash Main")!.unbalancedCents).toBeUndefined();
		expect(parseProps(vault.files.get(path)!)).toMatchObject({ tags: ["nestegg/account"] });
		expect(vault.files.get(path)).not.toContain("unbalancedCents");
	});

	it("rejects a non-integer difference", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.accounts.update("Cash Main", { unbalancedCents: 1.5 })).rejects.toThrow(/difference/);
	});

	it("changes the type and the net asset flag", async () => {
		const { ledger } = await loadedLedger();
		await ledger.accounts.update("Cash Main", { accountType: "creditCard" });
		expect(findAccount(ledger.snapshot, "Cash Main")!.accountType).toBe("creditCard");
	});

	it("rejects unknown accounts, bad dates and bad amounts", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.accounts.update("Nope", {})).rejects.toThrow(/No account/);
		await expect(ledger.accounts.update("Cash Main", { enteredBalanceAsOf: "x" })).rejects.toThrow(/date/);
		await expect(ledger.accounts.update("Cash Main", { enteredBalanceCents: 0.5 })).rejects.toThrow(/amount/);
	});
});

describe("setActive", () => {
	it("archives and restores, restoring net asset inclusion", async () => {
		const { ledger } = await loadedLedger();
		await ledger.accounts.update("Savings", { includeInNetAsset: true });
		await ledger.accounts.setActive("Savings", false);
		expect(findAccount(ledger.snapshot, "Savings")).toMatchObject({ active: false, includeInNetAsset: true });
		await ledger.accounts.setActive("Savings", true);
		expect(findAccount(ledger.snapshot, "Savings")).toMatchObject({ active: true, includeInNetAsset: true });
	});

	it("rejects an unknown account", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.accounts.setActive("Nope", false)).rejects.toThrow(LedgerError);
	});
});

describe("rename", () => {
	it("renames through the staged swap and keeps the vault valid", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.transactions.add(entry);
		await ledger.accounts.rename("Cash Main", "Wallet");
		expect(vault.exists(monthPath("Wallet", "2026-10"))).toBe(true);
		expect(findAccount(ledger.snapshot, "Wallet")).toBeDefined();
		expect(ledger.snapshot.settings!.settings.defaultAccount).toBe("Wallet");
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("surfaces planner errors", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.accounts.rename("Cash Main", "Savings")).rejects.toThrow(/already exists/);
	});
});

describe("remove", () => {
	it("removes an account with no transactions and tidies its folder", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.accounts.remove("Card");
		expect(findAccount(ledger.snapshot, "Card")).toBeUndefined();
		expect(vault.trashed).toEqual([accountPath("Card")]);
		expect(vault.removedFolders).toEqual(["Nestegg/Accounts/Card"]);
	});

	it("refuses when the account has transactions, or does not exist", async () => {
		const { ledger } = await loadedLedger();
		await ledger.transactions.add(entry);
		await expect(ledger.accounts.remove("Cash Main")).rejects.toThrow(/only be archived/);
		await expect(ledger.accounts.remove("Nope")).rejects.toThrow(/No account/);
	});
});

describe("Ledger.addAccount / archiveAccount", () => {
	const first = { accountType: "cash" as const, enteredBalanceCents: 0, enteredBalanceAsOf: "2026-10-01" };

	it("makes the first cash account the default and creates the settings note", async () => {
		const ledger = new Ledger(new MemoryVault());
		await ledger.load();
		expect(ledger.snapshot.settings).toBeNull();
		await ledger.addAccount({ ...first, name: "Wallet" });
		expect(ledger.snapshot.settings).not.toBeNull();
		expect(ledger.settings.current.defaultAccount).toBe("Wallet");
	});

	it("does not make a credit card the default, and keeps an existing usable default", async () => {
		const ledger = new Ledger(new MemoryVault());
		await ledger.load();
		await ledger.addAccount({ ...first, name: "Card", accountType: "creditCard" });
		expect(ledger.settings.current.defaultAccount).toBe("");
		await ledger.addAccount({ ...first, name: "Wallet" });
		await ledger.addAccount({ ...first, name: "Savings" });
		expect(ledger.settings.current.defaultAccount).toBe("Wallet");
	});

	it("replaces an unusable default when a cash account is added", async () => {
		const { ledger } = await loadedLedger();
		await ledger.accounts.setActive("Cash Main", false);
		await ledger.addAccount({ ...first, name: "Fresh" });
		expect(ledger.settings.current.defaultAccount).toBe("Fresh");
	});

	it("hands the default to another active cash account when the default is archived", async () => {
		const { ledger } = await loadedLedger();
		await ledger.archiveAccount("Cash Main");
		expect(findAccount(ledger.snapshot, "Cash Main")!.active).toBe(false);
		expect(ledger.settings.current.defaultAccount).toBe("Savings");
	});

	it("leaves the default alone when archiving some other account", async () => {
		const { ledger } = await loadedLedger();
		await ledger.archiveAccount("Savings");
		expect(ledger.settings.current.defaultAccount).toBe("Cash Main");
	});

	it("clears the default when no active cash account is left", async () => {
		const { ledger } = await loadedLedger();
		await ledger.archiveAccount("Savings");
		await ledger.archiveAccount("Cash Main");
		expect(ledger.settings.current.defaultAccount).toBe("");
	});
});

describe("account color", () => {
	it("gives a new account the next unused palette color unless one is chosen", async () => {
		const { ledger, vault } = await loadedLedger();
		const base = { accountType: "cash" as const, enteredBalanceCents: 0, enteredBalanceAsOf: "2026-10-01" };
		const used = ledger.snapshot.accounts.map((a) => a.account.color);
		await ledger.accounts.create({ ...base, name: "Auto" });
		const auto = findAccount(ledger.snapshot, "Auto")!.color;
		expect(used).not.toContain(auto);
		await ledger.accounts.create({ ...base, name: "Picked", color: "#ABCDEF" });
		expect(findAccount(ledger.snapshot, "Picked")!.color).toBe("#abcdef");
		expect(parseProps(vault.files.get(accountPath("Picked"))!).color).toBe("#abcdef");
	});

	it("changes the color on update, keeping the rest of the note", async () => {
		const { ledger, vault } = await loadedLedger();
		await ledger.accounts.update("Cash Main", { color: "#112233" });
		expect(findAccount(ledger.snapshot, "Cash Main")!.color).toBe("#112233");
		expect(parseProps(vault.files.get(accountPath("Cash Main"))!).name).toBe("Cash Main");
	});

	it("refuses a color that is not #rrggbb", async () => {
		const { ledger } = await loadedLedger();
		const base = { name: "X", accountType: "cash" as const, enteredBalanceCents: 0, enteredBalanceAsOf: "2026-10-01" };
		await expect(ledger.accounts.create({ ...base, color: "blue" })).rejects.toThrow(/color/);
		await expect(ledger.accounts.update("Cash Main", { color: "#12" })).rejects.toThrow(/color/);
	});
});
