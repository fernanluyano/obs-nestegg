import { describe, expect, it } from "vitest";
import { buildAccountNote } from "../../notes/accountNote";
import { markInTransit } from "../../notes/transit";
import { buildSnapshot } from "../../snapshot/snapshot";
import { validateSnapshot } from "../../validation/validate";
import { detectDuplicateAccounts, detectInvalidDefaultAccount, detectOrphanedAccounts, detectStaleBalances } from "../../validation/accountIssues";
import { detectDuplicateCategories, detectDuplicateSubcategories, detectUnknownSubcategories } from "../../validation/categoryIssues";
import { detectDuplicateMonths, detectMalformedRows, detectMonthTotals } from "../../validation/monthIssues";
import { detectInTransit, detectInvalidNotes, detectPathMismatches } from "../../validation/noteIssues";
import { detectTransferIssues } from "../../validation/transferIssues";
import { categoryIndexOf } from "../../snapshot/snapshot";
import {
	account, accountInput, category, categoryInput, inputOf, monthInput, settingsInput, tx, vaultInputs,
} from "../helpers/fixtures";

const snap = (inputs = vaultInputs()) => buildSnapshot(inputs);

describe("validateSnapshot", () => {
	it("is clean for a consistent vault", () => {
		expect(validateSnapshot(snap())).toEqual([]);
	});

	it("is clean for an empty vault", () => {
		expect(validateSnapshot(snap([]))).toEqual([]);
	});

	it("collects issues from every detector", () => {
		const inputs = vaultInputs({
			accounts: [account({ balanceCents: 1 })],
			months: [monthInput("Cash Main", "2026-10", [tx({ subcategory: "Nope" })]), monthInput("Ghost", "2026-10", [tx()])],
		});
		const types = new Set(validateSnapshot(snap(inputs)).map((i) => i.type));
		expect(types).toEqual(new Set(["unknownSubcategory", "accountBalance", "accountAvailable", "orphanedAccount"]));
	});
});

describe("account issues", () => {
	it("flags a stale balance with the recomputed value", () => {
		const s = snap(vaultInputs({ accounts: [account({ balanceCents: 5 })] }));
		expect(detectStaleBalances(s)).toEqual([
			{ type: "accountBalance", path: "Nestegg/Accounts/Cash Main/Cash Main.md", account: "Cash Main", storedCents: 5, actualCents: 200000 - 8450 },
		]);
	});

	it("passes a correct balance", () => {
		expect(detectStaleBalances(snap())).toEqual([]);
	});

	it("flags duplicate account names with both paths", () => {
		const dup = { ...accountInput(account()), path: "Elsewhere/Cash Main.md" };
		const issues = detectDuplicateAccounts(snap([accountInput(account()), dup]));
		expect(issues).toEqual([{ type: "duplicateName", kind: "account", name: "Cash Main", paths: ["Elsewhere/Cash Main.md", "Nestegg/Accounts/Cash Main/Cash Main.md"] }]);
	});

	it("groups orphaned month files by account with counts", () => {
		const s = snap(vaultInputs({
			months: [
				monthInput("Ghost", "2026-10", [tx(), tx()]),
				monthInput("Ghost", "2026-09", [tx()]),
				monthInput("Cash Main", "2026-10", [tx()]),
			],
		}));
		expect(detectOrphanedAccounts(s)).toEqual([{ type: "orphanedAccount", account: "Ghost", transactionCount: 3, months: ["2026-09", "2026-10"] }]);
	});

	it("flags a default account that is missing or archived", () => {
		const missing = snap(vaultInputs({ settings: { defaultAccount: "Nope", autoValidateOnLoad: true } }));
		expect(detectInvalidDefaultAccount(missing)).toEqual([{ type: "invalidDefaultAccount", path: "Nestegg/Settings.md", defaultAccount: "Nope" }]);
		const archived = snap(vaultInputs({ accounts: [account({ active: false })] }));
		expect(detectInvalidDefaultAccount(archived)).toHaveLength(1);
	});

	it("does not flag the default account when there are no accounts or no settings", () => {
		expect(detectInvalidDefaultAccount(snap([settingsInput()]))).toEqual([]);
		expect(detectInvalidDefaultAccount(snap([accountInput(account())]))).toEqual([]);
		expect(detectInvalidDefaultAccount(snap(vaultInputs()))).toEqual([]);
	});
});

describe("category issues", () => {
	const food = category("Food", "expense", ["Groceries", "Food - Misc"]);

	it("flags duplicate category names", () => {
		const dup = { ...categoryInput(food), path: "Other/Food.md" };
		const issues = detectDuplicateCategories(snap([categoryInput(food), dup]));
		expect(issues).toEqual([{ type: "duplicateName", kind: "category", name: "Food", paths: ["Nestegg/Categories/Food.md", "Other/Food.md"] }]);
	});

	it("flags a subcategory name shared by two categories", () => {
		const clash = category("Home", "expense", ["Groceries"]);
		expect(detectDuplicateSubcategories(snap([categoryInput(food), categoryInput(clash)]))).toEqual([
			{ type: "duplicateSubcategory", subcategory: "Groceries", categories: ["Food", "Home"] },
		]);
	});

	it("flags transactions whose subcategory no category lists", () => {
		const s = snap(vaultInputs({ months: [monthInput("Cash Main", "2026-10", [tx({ subcategory: "Nope" }), tx({ subcategory: "Nope" })]), monthInput("Cash Main", "2026-09", [tx({ subcategory: "Nope" })])] }));
		expect(detectUnknownSubcategories(s)).toEqual([{ type: "unknownSubcategory", subcategory: "Nope", transactionCount: 3, months: ["2026-09", "2026-10"] }]);
	});
});

describe("month issues", () => {
	it("flags stored totals that disagree with the rows", () => {
		const input = monthInput("Cash Main", "2026-10", [tx()]);
		const wrong = { ...input, props: { ...input.props, expenseCents: 1 } };
		const s = snap(vaultInputs({ months: [wrong] }));
		expect(detectMonthTotals(s, categoryIndexOf(s))).toEqual([
			{ type: "monthTotals", path: input.path, account: "Cash Main", month: "2026-10", stored: { incomeCents: 0, expenseCents: 1 }, actual: { incomeCents: 0, expenseCents: 8450 } },
		]);
	});

	it("flags missing totals and passes correct ones", () => {
		const input = monthInput("Cash Main", "2026-10", [tx()]);
		const missing = { ...input, props: { ...input.props, incomeCents: undefined, expenseCents: undefined } };
		const s = snap(vaultInputs({ months: [missing] }));
		expect(detectMonthTotals(s, categoryIndexOf(s))).toHaveLength(1);
		const clean = snap();
		expect(detectMonthTotals(clean, categoryIndexOf(clean))).toEqual([]);
	});

	it("surfaces unreadable rows from month files and category tables", () => {
		const month = monthInput("Cash Main", "2026-10", [tx()]);
		const broken = { ...month, content: month.content + "| 2026-10-09 | too few |\n" };
		const badCategory = inputOf("Nestegg/Categories/Bad.md", "---\ntags: [nestegg/category]\nname: Bad\n---\n| Subcategory | Type |\n|---|---|\n| a | expense | extra |\n| b | spending |\n");
		const issues = detectMalformedRows(snap(vaultInputs({ months: [broken] }).concat(badCategory)));
		expect(issues.map((i) => [i.path, i.line])).toEqual([[month.path, 13], [badCategory.path, 7], [badCategory.path, 8]]);
	});

	it("flags two files for the same account and month", () => {
		const a = monthInput("Cash Main", "2026-10", [tx()]);
		const b = { ...a, path: "Elsewhere/2026-10.md" };
		expect(detectDuplicateMonths(snap(vaultInputs({ months: [a, b] })))).toEqual([
			{ type: "duplicateMonth", account: "Cash Main", month: "2026-10", paths: ["Elsewhere/2026-10.md", a.path] },
		]);
		expect(detectDuplicateMonths(snap())).toEqual([]);
	});
});

describe("transfer issues", () => {
	const out = tx({ subcategory: "Account transfer", amountCents: -5000, fromTo: "Savings", merchant: "" });
	const inn = tx({ subcategory: "Account transfer", amountCents: 5000, fromTo: "Cash Main", merchant: "" });
	const accounts = [account(), account({ name: "Savings" })];
	const run = (cash: typeof out[], savings: typeof out[]) =>
		detectTransferIssues(snap(vaultInputs({ accounts, months: [monthInput("Cash Main", "2026-10", cash), monthInput("Savings", "2026-10", savings)] })));

	it("accepts a matched pair", () => {
		expect(run([out], [inn])).toEqual([]);
	});

	it("flags a row with no partner", () => {
		expect(run([out], [])).toEqual([
			{ type: "transfer", problem: "noPartner", path: "Nestegg/Accounts/Cash Main/Transactions/2026-10.md", account: "Cash Main", date: "2026-10-03", fromTo: "Savings", amountCents: -5000 },
		]);
	});

	it("flags a partner with a different amount or date on both sides", () => {
		expect(run([out], [{ ...inn, amountCents: 4000 }]).map((i) => i.problem)).toEqual(["noPartner", "noPartner"]);
		expect(run([out], [{ ...inn, date: "2026-10-04" }])).toHaveLength(2);
	});

	it("pairs each partner only once", () => {
		expect(run([out, out], [inn])).toHaveLength(1);
		expect(run([out, out], [inn, inn])).toEqual([]);
	});

	it("flags a transfer row without FromTo or pointing at its own account", () => {
		expect(run([{ ...out, fromTo: "" }], []).map((i) => i.problem)).toEqual(["missingFromTo"]);
		expect(run([{ ...out, fromTo: "Cash Main" }], []).map((i) => i.problem)).toEqual(["sameAccount"]);
	});

	it("flags FromTo on a non-transfer row", () => {
		expect(run([tx({ fromTo: "Savings" })], []).map((i) => i.problem)).toEqual(["fromToOnNonTransfer"]);
	});

	it("flags a transfer to an account that does not exist", () => {
		expect(run([{ ...out, fromTo: "Ghost" }], []).map((i) => i.problem)).toEqual(["noPartner"]);
	});
});

describe("note issues", () => {
	it("flags files that are not where their properties say, trusting the property", () => {
		const moved = { ...accountInput(account()), path: "Somewhere/Cash Main.md" };
		const s = snap([moved, { ...settingsInput(), path: "S.md" }, { ...categoryInput(category("Food", "expense", [])), path: "F.md" }, { ...monthInput("Cash Main", "2026-10", []), path: "M.md" }]);
		expect(s.accounts[0].account.name).toBe("Cash Main");
		expect(detectPathMismatches(s).map((i) => [i.kind, i.path, i.expectedPath])).toEqual([
			["settings", "S.md", "Nestegg/Settings.md"],
			["account", "Somewhere/Cash Main.md", "Nestegg/Accounts/Cash Main/Cash Main.md"],
			["category", "F.md", "Nestegg/Categories/Food.md"],
			["transactions", "M.md", "Nestegg/Accounts/Cash Main/Transactions/2026-10.md"],
		]);
		expect(detectPathMismatches(snap())).toEqual([]);
	});

	it("reports staged copies left behind", () => {
		const staged = inputOf("x (in transit).md", markInTransit(buildAccountNote(account()), "x.md"));
		expect(detectInTransit(snap([staged]))).toEqual([{ type: "inTransit", kind: "account", path: "x (in transit).md", transitFor: "x.md" }]);
	});

	it("reports notes that could not be read", () => {
		const bad = inputOf("a.md", "---\ntags: [nestegg/account]\nname: A\n---\n");
		expect(detectInvalidNotes(snap([bad]))).toEqual([{ type: "invalidNote", kind: "account", path: "a.md", reason: expect.stringContaining("accountType") }]);
	});
});
