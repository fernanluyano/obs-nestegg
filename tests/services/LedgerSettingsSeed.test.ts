import { describe, expect, it } from "vitest";
import { defaultCategories } from "../../domain/defaults";
import { Ledger } from "../../services/Ledger";
import { isEmptyVault, seedVault } from "../../services/seed";
import { SETTINGS_PATH } from "../../notes/paths";
import { buildSnapshot, emptySnapshot } from "../../snapshot/snapshot";
import { validateSnapshot } from "../../validation/validate";
import { MemoryVault } from "../helpers/memoryVault";
import { loadedLedger } from "../helpers/ledgerFixture";
import { account, accountInput, asset, assetInput, settingsInput } from "../helpers/fixtures";

describe("isEmptyVault / seedVault", () => {
	it("is empty only when no Nestegg note exists", () => {
		expect(isEmptyVault(emptySnapshot())).toBe(true);
		expect(isEmptyVault(buildSnapshot([settingsInput()]))).toBe(false);
		expect(isEmptyVault(buildSnapshot([accountInput(account())]))).toBe(false);
		expect(isEmptyVault(buildSnapshot([assetInput(asset())]))).toBe(false);
	});

	it("is not empty when only invalid or staged notes remain", () => {
		const invalid = emptySnapshot();
		invalid.invalid.push({ path: "x", kind: "account", reason: "r" });
		expect(isEmptyVault(invalid)).toBe(false);
		const staged = emptySnapshot();
		staged.transit.push({ path: "x", kind: "account" });
		expect(isEmptyVault(staged)).toBe(false);
	});

	it("lays out only the default categories: no settings note and no account", async () => {
		const vault = new MemoryVault();
		await seedVault(vault);
		expect(vault.exists(SETTINGS_PATH)).toBe(false);
		expect([...vault.files.keys()].some((p) => p.includes("/Accounts/"))).toBe(false);
		expect(vault.files.size).toBe(defaultCategories().length);
	});
});

describe("Ledger.load", () => {
	it("seeds a brand-new vault with the starter categories, leaving settings and accounts to the user", async () => {
		const ledger = new Ledger(new MemoryVault());
		await ledger.load();
		expect(ledger.snapshot.settings).toBeNull();
		expect(ledger.snapshot.accounts).toEqual([]);
		expect(ledger.snapshot.categories).toHaveLength(defaultCategories().length);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("never reseeds a vault that already has notes", async () => {
		const { ledger, vault } = await loadedLedger();
		const before = vault.files.size;
		await ledger.load();
		expect(vault.files.size).toBe(before);
	});

	it("reloads on demand", async () => {
		const { ledger, vault } = await loadedLedger();
		vault.files.delete("Nestegg/Categories/Lifestyle.md");
		expect(await ledger.reload()).toBe(ledger.snapshot);
		expect(ledger.snapshot.categories.some((c) => c.category.name === "Lifestyle")).toBe(false);
	});
});

describe("SettingsService", () => {
	it("reads defaults before a settings note exists and creates it on the first update", async () => {
		const vault = new MemoryVault({ "Nestegg/Accounts/A/A.md": accountInput(account({ name: "A" })).content });
		const ledger = new Ledger(vault);
		await ledger.load();
		expect(ledger.settings.current).toEqual({ defaultAccount: "", autoValidateOnLoad: true });
		await ledger.settings.update({ defaultAccount: "A" });
		expect(vault.exists(SETTINGS_PATH)).toBe(true);
		expect(ledger.settings.current.defaultAccount).toBe("A");
	});

	it("patches an existing settings note and keeps the other value", async () => {
		const { ledger } = await loadedLedger();
		await ledger.settings.update({ autoValidateOnLoad: false });
		expect(ledger.settings.current).toEqual({ defaultAccount: "Cash Main", autoValidateOnLoad: false });
	});
});
