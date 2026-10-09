import { describe, expect, it } from "vitest";
import { buildCategoryIndex } from "../../domain/categories";
import { buildSnapshot, accountTransactions, categoryIndexOf, emptySnapshot, entriesOf } from "../../snapshot/snapshot";
import { markInTransit } from "../../notes/transit";
import { buildAccountNote } from "../../notes/accountNote";
import { accountPath } from "../../notes/paths";
import {
	account, accountInput, categoryInput, inputOf, monthInput, settingsInput, tx, vaultInputs,
} from "../helpers/fixtures";
import { defaultCategories } from "../../domain/defaults";

describe("buildSnapshot", () => {
	it("sorts every note kind into its bucket", () => {
		const snap = buildSnapshot(vaultInputs());
		expect(snap.settings?.settings.defaultAccount).toBe("Cash Main");
		expect(snap.accounts.map((a) => a.account.name)).toEqual(["Cash Main"]);
		expect(snap.categories).toHaveLength(defaultCategories().length);
		expect(snap.months).toHaveLength(1);
		expect(snap.months[0]).toMatchObject({ account: "Cash Main", month: "2026-10", transactions: [tx()] });
		expect(snap.transit).toEqual([]);
		expect(snap.invalid).toEqual([]);
	});

	it("ignores notes that are not Nestegg notes", () => {
		const snap = buildSnapshot([inputOf("Daily/today.md", "---\ntags: [daily]\n---\nhello"), inputOf("x.md", "no props")]);
		expect(snap).toEqual(emptySnapshot());
	});

	it("sets staged copies aside instead of counting them", () => {
		const staged = inputOf("Nestegg/Accounts/Cash Main/Cash Main (in transit).md", markInTransit(buildAccountNote(account()), accountPath("Cash Main")));
		const snap = buildSnapshot([staged]);
		expect(snap.accounts).toEqual([]);
		expect(snap.transit).toEqual([{ path: staged.path, kind: "account", transitFor: accountPath("Cash Main") }]);
	});

	it("reports notes missing required properties without dropping the rest", () => {
		const broken = [
			inputOf("a.md", "---\ntags: [nestegg/account]\nname: A\naccountType: bank\n---\n"),
			inputOf("c.md", "---\ntags: [nestegg/category]\ncategoryType: expense\n---\n"),
			inputOf("m.md", "---\ntags: [nestegg/transactions]\nmonth: 2026-10\n---\n"),
		];
		const snap = buildSnapshot([...broken, accountInput(account())]);
		expect(snap.accounts).toHaveLength(1);
		expect(snap.invalid.map((i) => [i.path, i.kind])).toEqual([
			["a.md", "account"], ["c.md", "category"], ["m.md", "transactions"],
		]);
	});

	it("keeps the first of several settings notes, by path", () => {
		const first = settingsInput({ defaultAccount: "A", autoValidateOnLoad: true });
		const second = { ...settingsInput({ defaultAccount: "B", autoValidateOnLoad: true }), path: "Z/Settings.md" };
		expect(buildSnapshot([second, first]).settings?.settings.defaultAccount).toBe("A");
	});

	it("is independent of input order", () => {
		const inputs = vaultInputs();
		expect(buildSnapshot([...inputs].reverse())).toEqual(buildSnapshot(inputs));
	});
});

describe("snapshot helpers", () => {
	const snap = buildSnapshot(
		vaultInputs({
			accounts: [account(), account({ name: "Savings" })],
			months: [
				monthInput("Cash Main", "2026-10", [tx({ note: "a" })]),
				monthInput("Cash Main", "2026-11", [tx({ note: "b" })]),
				monthInput("Savings", "2026-10", [tx({ note: "c" })]),
			],
		}),
	);

	it("builds the category index from the loaded categories", () => {
		expect(categoryIndexOf(snap).typeOf("Salary")).toBe("income");
		expect(categoryIndexOf(snap).typeOf("Groceries")).toBe(buildCategoryIndex(defaultCategories()).typeOf("Groceries"));
	});

	it("flattens months into entries tagged with their account", () => {
		expect(entriesOf(snap.months).map((e) => [e.account, e.note])).toEqual([
			["Cash Main", "a"], ["Cash Main", "b"], ["Savings", "c"],
		]);
	});

	it("collects one account's transactions across months", () => {
		expect(accountTransactions(snap, "Cash Main").map((t) => t.note)).toEqual(["a", "b"]);
		expect(accountTransactions(snap, "Nobody")).toEqual([]);
	});
});

describe("category notes in the snapshot", () => {
	it("carries table issues through", () => {
		const bad = inputOf("Nestegg/Categories/Food.md", "---\ntags: [nestegg/category]\nname: Food\n---\n| Subcategory | Type |\n|---|---|\n| a | expense | extra |\n");
		expect(buildSnapshot([bad]).categories[0].tableIssues).toHaveLength(1);
		const badType = inputOf("Nestegg/Categories/Food.md", "---\ntags: [nestegg/category]\nname: Food\n---\n| Subcategory | Type |\n|---|---|\n| a | spending |\n");
		expect(buildSnapshot([badType]).categories[0].tableIssues).toHaveLength(1);
		expect(buildSnapshot([categoryInput(defaultCategories()[0])]).categories[0].tableIssues).toEqual([]);
	});
});
