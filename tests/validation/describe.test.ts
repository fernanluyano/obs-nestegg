import { describe, expect, it } from "vitest";
import { describeIssue, groupBySection } from "../../validation/describe";
import type { ValidationIssue } from "../../validation/issues";

const view = (issue: ValidationIssue) => describeIssue(issue);

describe("describeIssue", () => {
	it("explains stale month totals and offers a recalculation", () => {
		const v = view({
			type: "monthTotals", path: "p.md", account: "Cash", month: "2026-10",
			stored: { incomeCents: 100, expenseCents: undefined }, actual: { incomeCents: 250000, expenseCents: 8450 },
		});
		expect(v.text).toBe("Cash 2026-10: income should be 2,500.00 (stored: 1.00), expense should be 84.50 (stored: —)");
		expect(v.fixes).toEqual([{ label: "validation.fix.recalculate", action: { kind: "recalculateMonthTotals", path: "p.md" } }]);
		expect(v.auto).toBe(true);
	});

	it("explains a stale balance", () => {
		const v = view({ type: "accountBalance", path: "p", account: "Cash", storedCents: 5, actualCents: -150 });
		expect(v.text).toBe("Cash: balance should be -1.50 (stored: 0.05)");
		expect(v.fixes[0].action).toEqual({ kind: "recalculateBalance", account: "Cash" });
		expect(v.auto).toBe(true);
	});

	it("offers to create the account for orphaned months", () => {
		const v = view({ type: "orphanedAccount", account: "Ghost", transactionCount: 3, months: ["2026-09", "2026-10"] });
		expect(v.text).toContain('"Ghost"');
		expect(v.text).toContain("3 transaction(s) in 2026-09, 2026-10");
		expect(v.fixes[0].action).toEqual({ kind: "createMissingAccount", account: "Ghost" });
	});

	it("offers to reset an invalid default account", () => {
		const v = view({ type: "invalidDefaultAccount", path: "Settings.md", defaultAccount: "Gone" });
		expect(v.text).toContain('"Gone"');
		expect(v.fixes[0].action).toEqual({ kind: "resetDefaultAccount" });
		expect(v.auto).toBe(true);
	});

	it("offers promote and discard for leftovers, never automatically", () => {
		const v = view({ type: "inTransit", kind: "account", path: "x (in transit).md" });
		expect(v.fixes.map((f) => f.action.kind)).toEqual(["promoteInTransit", "discardInTransit"]);
		expect(v.auto).toBe(false);
	});

	it("offers to move a misplaced note, but not automatically", () => {
		const v = view({ type: "pathMismatch", kind: "category", path: "a.md", expectedPath: "Nestegg/Categories/A.md" });
		expect(v.text).toBe("a.md should be at Nestegg/Categories/A.md");
		expect(v.fixes[0].action).toEqual({ kind: "moveToExpectedPath", path: "a.md", expectedPath: "Nestegg/Categories/A.md" });
		expect(v.auto).toBe(false);
	});

	it.each<[ValidationIssue, string]>([
		[{ type: "malformedRow", path: "Nestegg/Accounts/A/Transactions/2026-10.md", line: 12, reason: "invalid date", text: "" }, "2026-10, line 12: invalid date"],
		[{ type: "duplicateName", kind: "account", name: "Cash", paths: ["a.md", "b.md"] }, 'Two or more account notes are named "Cash": a.md, b.md'],
		[{ type: "duplicateMonth", account: "Cash", month: "2026-10", paths: ["a.md", "b.md"] }, "Cash has more than one file for 2026-10: a.md, b.md"],
		[{ type: "duplicateSubcategory", subcategory: "X", categories: ["A", "B"] }, 'Subcategory "X" appears in: A, B'],
		[{ type: "unknownSubcategory", subcategory: "X", transactionCount: 2, months: ["2026-10"] }, 'No category lists "X" — 2 transaction(s) in 2026-10'],
		[{ type: "invalidNote", kind: "account", path: "a.md", reason: "missing name" }, "a.md: missing name"],
	])("describes %j as information only", (issue, text) => {
		const v = view(issue);
		expect(v.text).toBe(text);
		expect(v.fixes).toEqual([]);
		expect(v.auto).toBe(false);
	});

	it.each([
		["noPartner", "Cash, 2026-10-05: transfer of 50.00 to/from Savings has no matching row on the other side"],
		["missingFromTo", "Cash, 2026-10-05: transfer row has no FromTo account"],
		["sameAccount", "Cash, 2026-10-05: transfer row points at its own account"],
		["fromToOnNonTransfer", "Cash, 2026-10-05: FromTo is set on a row that is not a transfer"],
	] as const)("describes a %s transfer problem", (problem, text) => {
		const v = view({ type: "transfer", problem, path: "p", account: "Cash", date: "2026-10-05", fromTo: "Savings", amountCents: -5000 });
		expect(v.text).toBe(text);
		expect(v.fixes).toEqual([]);
	});
});

describe("groupBySection", () => {
	it("groups by section in first-seen order", () => {
		const a = view({ type: "accountBalance", path: "p", account: "A", storedCents: 1, actualCents: 2 });
		const b = view({ type: "invalidNote", kind: "account", path: "x", reason: "r" });
		const c = view({ type: "accountBalance", path: "p", account: "B", storedCents: 1, actualCents: 2 });
		const groups = groupBySection([a, b, c]);
		expect([...groups.keys()]).toEqual(["validation.section.accountBalance", "validation.section.invalidNote"]);
		expect(groups.get("validation.section.accountBalance")).toEqual([a, c]);
	});

	it("is empty for no issues", () => {
		expect(groupBySection([]).size).toBe(0);
	});
});
