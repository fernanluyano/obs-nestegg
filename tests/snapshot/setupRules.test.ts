import { describe, expect, it } from "vitest";
import { buildSnapshot, emptySnapshot } from "../../snapshot/snapshot";
import { canRemoveAccount, cashAccountCheck, categoriesCheck, defaultAccountCheck, needsSetup } from "../../snapshot/setupRules";
import { account, accountInput, category, categoryInput, settingsInput, vaultInputs } from "../helpers/fixtures";

const card = account({ name: "Card", accountType: "creditCard" });
const food = category("Food", "expense", ["Groceries", "Food - Misc"]);

const snap = (accounts = [account()], settings = { defaultAccount: "Cash Main", autoValidateOnLoad: true }) =>
	buildSnapshot(vaultInputs({ accounts, months: [], settings }));

describe("cashAccountCheck", () => {
	it("requires an active cash account", () => {
		expect(cashAccountCheck(snap())).toEqual({ ok: true });
		expect(cashAccountCheck(snap([]))).toEqual({ ok: false, reason: "wizard.needCashAccount" });
	});

	it("does not accept a credit card or an archived account instead of cash", () => {
		expect(cashAccountCheck(snap([card]))).toMatchObject({ ok: false, reason: "wizard.needCashAccount" });
		expect(cashAccountCheck(snap([account({ active: false })]))).toMatchObject({ ok: false });
		expect(cashAccountCheck(snap([account({ active: false }), card, account({ name: "Other" })]))).toEqual({ ok: true });
	});
});

describe("categoriesCheck", () => {
	it("requires at least one category", () => {
		expect(categoriesCheck(buildSnapshot([accountInput(account())]))).toEqual({ ok: false, reason: "wizard.needCategory" });
		expect(categoriesCheck(snap())).toEqual({ ok: true });
	});

	it("names the first category that has no subcategory", () => {
		const empty = category("Hollow", "expense", []);
		const snapshot = buildSnapshot([categoryInput(food), categoryInput(empty)]);
		expect(categoriesCheck(snapshot)).toEqual({ ok: false, reason: "wizard.emptyCategory", vars: { name: "Hollow" } });
	});

	it("counts Misc as a subcategory", () => {
		const miscOnly = category("Lifestyle", "expense", ["Lifestyle - Misc"]);
		expect(categoriesCheck(buildSnapshot([categoryInput(miscOnly)]))).toEqual({ ok: true });
	});
});

describe("defaultAccountCheck", () => {
	it("requires the default account to be an active cash account", () => {
		expect(defaultAccountCheck(snap())).toEqual({ ok: true });
		expect(defaultAccountCheck(snap([account(), card], { defaultAccount: "Card", autoValidateOnLoad: true }))).toMatchObject({ ok: false, reason: "wizard.needDefaultCash" });
		expect(defaultAccountCheck(snap([account()], { defaultAccount: "Gone", autoValidateOnLoad: true }))).toMatchObject({ ok: false });
		expect(defaultAccountCheck(buildSnapshot([accountInput(account())]))).toMatchObject({ ok: false });
	});
});

describe("needsSetup", () => {
	it("is true exactly while the settings note does not exist", () => {
		expect(needsSetup(emptySnapshot())).toBe(true);
		expect(needsSetup(buildSnapshot([accountInput(account())]))).toBe(true);
		expect(needsSetup(buildSnapshot([settingsInput()]))).toBe(false);
	});
});

describe("canRemoveAccount", () => {
	it("blocks the last active cash account", () => {
		const only = buildSnapshot(vaultInputs({ accounts: [account(), card], months: [] }));
		expect(canRemoveAccount(only, "Cash Main")).toEqual({ ok: false, reason: "wizard.lastCashAccount" });
	});

	it("allows a card, a second cash account, and an account that is not the last cash", () => {
		const two = buildSnapshot(vaultInputs({ accounts: [account(), account({ name: "Savings" }), card], months: [] }));
		expect(canRemoveAccount(two, "Cash Main")).toEqual({ ok: true });
		expect(canRemoveAccount(two, "Card")).toEqual({ ok: true });
		const one = buildSnapshot(vaultInputs({ accounts: [account(), card], months: [] }));
		expect(canRemoveAccount(one, "Card")).toEqual({ ok: true });
	});

	it("does not count an archived cash account as the one that must stay", () => {
		const snapshot = buildSnapshot(vaultInputs({ accounts: [account(), account({ name: "Old", active: false })], months: [] }));
		expect(canRemoveAccount(snapshot, "Old")).toEqual({ ok: true });
		expect(canRemoveAccount(snapshot, "Cash Main")).toMatchObject({ ok: false });
	});
});
