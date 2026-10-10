import { describe, expect, it } from "vitest";
import { parseProps } from "../../notes/frontmatter";
import { accountPath, monthPath } from "../../notes/paths";
import { findAccount } from "../../snapshot/queries";
import { LedgerError } from "../../services/errors";
import { Ledger } from "../../services/Ledger";
import { validateSnapshot } from "../../validation/validate";
import { addMortgage, loadedLedger } from "../helpers/ledgerFixture";
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

	it("refuses to change an account's type", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.accounts.update("Cash Main", { accountType: "creditCard" } as never)).rejects.toThrow(/type cannot be changed/);
		expect(findAccount(ledger.snapshot, "Cash Main")!.accountType).toBe("cash");
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

describe("loans", () => {
	const loan = { name: "Mortgage", accountType: "loan" as const, loanKind: "mortgage" as const, enteredBalanceCents: -20000000, enteredBalanceAsOf: "2026-10-01" };

	it("creates a loan with just a kind and a balance, and loads it back", async () => {
		const { ledger } = await loadedLedger();
		await ledger.accounts.create(loan);
		const created = findAccount(ledger.snapshot, "Mortgage")!;
		expect(created).toMatchObject({ accountType: "loan", loanKind: "mortgage", balanceCents: -20000000 });
		expect(created.termMonths).toBeUndefined();
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("creates a loan with its payment plan", async () => {
		const { ledger } = await loadedLedger();
		await ledger.accounts.create({ ...loan, termMonths: 360, startDate: "2024-03-01", interest: 6.25 });
		expect(findAccount(ledger.snapshot, "Mortgage")).toMatchObject({ termMonths: 360, startDate: "2024-03-01", interest: 6.25 });
	});

	it("stores the original amount, clears it when passed undefined, and rejects bad amounts", async () => {
		const { ledger } = await loadedLedger();
		await ledger.accounts.create({ ...loan, originalCents: 25000000 });
		expect(findAccount(ledger.snapshot, "Mortgage")!.originalCents).toBe(25000000);
		await expect(ledger.accounts.update("Mortgage", { originalCents: 0 })).rejects.toThrow(/original amount/);
		await ledger.accounts.update("Mortgage", { originalCents: undefined });
		expect(findAccount(ledger.snapshot, "Mortgage")!.originalCents).toBeUndefined();
	});

	it("stores the extra payment, clears it when passed undefined, and rejects bad amounts", async () => {
		const { ledger } = await loadedLedger();
		await ledger.accounts.create(loan);
		await ledger.accounts.update("Mortgage", { extraPaymentCents: 25000 });
		expect(findAccount(ledger.snapshot, "Mortgage")!.extraPaymentCents).toBe(25000);
		await expect(ledger.accounts.update("Mortgage", { extraPaymentCents: -1 })).rejects.toThrow(/extra payment/);
		await ledger.accounts.update("Mortgage", { extraPaymentCents: undefined });
		expect(findAccount(ledger.snapshot, "Mortgage")!.extraPaymentCents).toBeUndefined();
	});

	it("rejects an extra payment on a card", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.accounts.create({ name: "Store Card", accountType: "creditCard", enteredBalanceCents: 0, enteredBalanceAsOf: "2026-10-01", extraPaymentCents: 100 } as never)).rejects.toThrow(/extra payment/);
	});

	it("rejects a loan without a kind and bad plan fields", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.accounts.create({ ...loan, loanKind: undefined })).rejects.toThrow(/needs a kind/);
		await expect(ledger.accounts.create({ ...loan, termMonths: 0 })).rejects.toThrow(/term/);
		await expect(ledger.accounts.create({ ...loan, termMonths: 1.5 })).rejects.toThrow(/term/);
		await expect(ledger.accounts.create({ ...loan, interest: -1 })).rejects.toThrow(/interest/);
		await expect(ledger.accounts.create({ ...loan, startDate: "2024-13-40" })).rejects.toThrow(/start date/);
		expect(findAccount(ledger.snapshot, "Mortgage")).toBeUndefined();
	});

	it("refuses loan fields on cash and credit card accounts", async () => {
		const { ledger } = await loadedLedger();
		const base = { name: "X", enteredBalanceCents: 0, enteredBalanceAsOf: "2026-10-01", termMonths: 12 };
		await expect(ledger.accounts.create({ ...base, accountType: "cash" })).rejects.toThrow(/Only a loan/);
		await expect(ledger.accounts.create({ ...base, accountType: "creditCard" })).rejects.toThrow(/Only a loan/);
		await expect(ledger.accounts.update("Card", { loanKind: "car" })).rejects.toThrow(/Only a loan/);
	});

	it("updates the plan, and clears a field passed as undefined", async () => {
		const { ledger } = await loadedLedger();
		await ledger.accounts.create({ ...loan, termMonths: 360, interest: 6.25 });
		await ledger.accounts.update("Mortgage", { termMonths: 240, interest: undefined });
		const updated = findAccount(ledger.snapshot, "Mortgage")!;
		expect(updated.termMonths).toBe(240);
		expect(updated.interest).toBeUndefined();
		await expect(ledger.accounts.update("Mortgage", { termMonths: 0 })).rejects.toThrow(/term/);
	});

	it("sets a payment category on a loan, and only on one", async () => {
		const { ledger } = await loadedLedger();
		await addMortgage(ledger);
		await ledger.accounts.update("Mortgage", { paymentSubcategory: "Loan payment" });
		expect(findAccount(ledger.snapshot, "Mortgage")!.paymentSubcategory).toBe("Loan payment");
		await expect(ledger.accounts.update("Cash Main", { paymentSubcategory: "Loan payment" })).rejects.toThrow(/Only a loan/);
		await expect(ledger.accounts.update("Card", { paymentSubcategory: "Loan payment" })).rejects.toThrow(/Only a loan/);
		await expect(ledger.accounts.update("Mortgage", { paymentSubcategory: "Credit card payment" })).rejects.toThrow(/not a debt payment/);
		await expect(ledger.accounts.update("Mortgage", { paymentSubcategory: "Groceries" })).rejects.toThrow(/not a debt payment/);
		await expect(ledger.accounts.update("Mortgage", { paymentSubcategory: "Nope" })).rejects.toThrow(/not a debt payment/);
		await ledger.accounts.update("Mortgage", { paymentSubcategory: undefined });
		expect(findAccount(ledger.snapshot, "Mortgage")!.paymentSubcategory).toBeUndefined();
	});

	it("does not become the default account", async () => {
		const { ledger } = await loadedLedger();
		await ledger.addAccount({ ...loan, name: "Car loan", loanKind: "car" });
		expect(ledger.settings.current.defaultAccount).not.toBe("Car loan");
	});
});
