import { describe, expect, it } from "vitest";
import { buildAccountNote } from "../../notes/accountNote";
import { parseProps } from "../../notes/frontmatter";
import { monthPath } from "../../notes/paths";
import { markInTransit } from "../../notes/transit";
import { findAccount } from "../../snapshot/queries";
import { LedgerError } from "../../services/errors";
import { account, monthInput, tx, vaultInputs } from "../helpers/fixtures";
import { loadedLedger, TODAY } from "../helpers/ledgerFixture";

const types = (issues: { type: string }[]) => issues.map((i) => i.type);

describe("validate", () => {
	it("is clean for a healthy vault and reloads first, so changes on disk are seen", async () => {
		const { ledger, vault } = await loadedLedger();
		expect(await ledger.validation.validate()).toEqual([]);
		vault.files.set(monthPath("Ghost", "2026-10"), monthInput("Ghost", "2026-10", [tx()]).content);
		expect(types(await ledger.validation.validate())).toContain("orphanedAccount");
	});
});

describe("recalculateMonthTotals", () => {
	it("rewrites stale totals from the rows", async () => {
		const { ledger, vault } = await loadedLedger();
		const path = monthPath("Cash Main", "2026-10");
		vault.files.set(path, monthInput("Cash Main", "2026-10", [tx()]).content.replace("expenseCents: 8450", "expenseCents: 1"));
		expect(types(await ledger.validation.validate())).toContain("monthTotals");
		await ledger.validation.recalculateMonthTotals(path);
		expect(types(await ledger.validation.validate())).not.toContain("monthTotals");
	});

	it("rejects a month that is gone", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.validation.recalculateMonthTotals("nope.md")).rejects.toThrow(LedgerError);
	});
});

describe("recalculateBalance", () => {
	it("rewrites a stale cached balance", async () => {
		const { ledger, vault } = await loadedLedger();
		const path = "Nestegg/Accounts/Cash Main/Cash Main.md";
		vault.files.set(path, buildAccountNote(account({ balanceCents: 1 })));
		expect(types(await ledger.validation.validate())).toContain("accountBalance");
		await ledger.validation.recalculateBalance("Cash Main");
		expect(parseProps(vault.files.get(path)!).balanceCents).toBe(200000);
		expect(types(await ledger.validation.validate())).not.toContain("accountBalance");
	});
});

describe("createMissingAccount", () => {
	it("creates an archived account for stranded month files, balanced from their rows", async () => {
		const { ledger, vault } = await loadedLedger();
		vault.files.set(monthPath("Ghost", "2026-10"), monthInput("Ghost", "2026-10", [tx({ amountCents: -300, date: "2026-10-05" })]).content);
		await ledger.reload();
		await ledger.validation.createMissingAccount("Ghost", "2026-10-01");
		expect(findAccount(ledger.snapshot, "Ghost")).toMatchObject({ active: false, includeInNetAsset: false, balanceCents: -300 });
		expect(types(await ledger.validation.validate())).toEqual([]);
	});

	it("uses today's date as the checkpoint when none is given by the caller", async () => {
		const { ledger } = await loadedLedger();
		await ledger.validation.createMissingAccount("Empty", TODAY);
		expect(findAccount(ledger.snapshot, "Empty")!.enteredBalanceAsOf).toBe(TODAY);
	});
});

describe("resetDefaultAccount", () => {
	it("points the default at the first active cash account, skipping credit cards", async () => {
		const { ledger } = await loadedLedger();
		await ledger.settings.update({ defaultAccount: "Gone" });
		expect(types(await ledger.validation.validate())).toContain("invalidDefaultAccount");
		await ledger.validation.resetDefaultAccount();
		expect(ledger.settings.current.defaultAccount).toBe("Cash Main");
	});

	it("flags a credit card as the default account", async () => {
		const { ledger } = await loadedLedger();
		await ledger.settings.update({ defaultAccount: "Card" });
		expect(types(await ledger.validation.validate())).toContain("invalidDefaultAccount");
	});

	it("fails when there is no active cash account to use", async () => {
		const { ledger } = await loadedLedger();
		for (const name of ["Cash Main", "Savings"]) await ledger.accounts.setActive(name, false);
		await expect(ledger.validation.resetDefaultAccount()).rejects.toThrow(/no active cash account/);

		const empty = await loadedLedger(vaultInputs({ accounts: [], months: [] }));
		await expect(empty.ledger.validation.resetDefaultAccount()).rejects.toThrow(/no active cash account/);
	});
});

describe("moveToExpectedPath", () => {
	it("moves a misplaced note to where its properties say and tidies the old folder", async () => {
		const { ledger, vault } = await loadedLedger();
		const content = vault.files.get("Nestegg/Categories/Lifestyle.md")!;
		vault.files.delete("Nestegg/Categories/Lifestyle.md");
		vault.files.set("Misc/Whatever.md", content);
		await ledger.reload();
		await ledger.validation.moveToExpectedPath("Misc/Whatever.md", "Nestegg/Categories/Lifestyle.md");
		expect(vault.exists("Nestegg/Categories/Lifestyle.md")).toBe(true);
		expect(vault.removedFolders).toEqual(["Misc"]);
	});

	it("refuses when the destination is taken", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.validation.moveToExpectedPath("Nestegg/Categories/Lifestyle.md", "Nestegg/Categories/Food.md")).rejects.toThrow(/already exists/);
	});
});

describe("in-transit recovery", () => {
	async function withStaged() {
		const fixture = await loadedLedger();
		const stagedPath = "Nestegg/Categories/Lifestyle (in transit).md";
		fixture.vault.files.set(stagedPath, markInTransit(fixture.vault.files.get("Nestegg/Categories/Lifestyle.md")!, "Nestegg/Categories/Lifestyle.md"));
		expect(types(await fixture.ledger.validation.validate())).toContain("inTransit");
		return { ...fixture, stagedPath };
	}

	it("promotes a staged copy over the original", async () => {
		const { ledger, vault, stagedPath } = await withStaged();
		await ledger.validation.promoteInTransit(stagedPath);
		expect(vault.exists(stagedPath)).toBe(false);
		expect(vault.exists("Nestegg/Categories/Lifestyle.md")).toBe(true);
		expect(types(await ledger.validation.validate())).toEqual([]);
	});

	it("discards a staged copy and keeps the original", async () => {
		const { ledger, vault, stagedPath } = await withStaged();
		await ledger.validation.discardInTransit(stagedPath);
		expect(vault.exists(stagedPath)).toBe(false);
		expect(vault.exists("Nestegg/Categories/Lifestyle.md")).toBe(true);
		expect(types(await ledger.validation.validate())).toEqual([]);
	});
});
