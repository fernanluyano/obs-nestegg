import { describe, expect, it } from "vitest";
import { addBucketRow } from "../../notes/bucketTable";
import { buildAccountNote } from "../../notes/accountNote";
import { accountPath } from "../../notes/paths";
import { detectNegativeAvailable, detectStaleAvailable } from "../../validation/accountIssues";
import { describeIssue } from "../../validation/describe";
import { detectMalformedRows } from "../../validation/monthIssues";
import { validateSnapshot } from "../../validation/validate";
import { account, inputOf, snapshotOf, vaultInputs } from "../helpers/fixtures";

// A cash account note holding the given buckets, with explicit cached amounts.
function noteWith(buckets: [string, number][], over = {}) {
	let content = buildAccountNote(account({ balanceCents: 200000, ...over }));
	for (const [name, balanceCents] of buckets) content = addBucketRow(content, { name, balanceCents });
	return inputOf(accountPath("Cash Main"), content);
}

function snapshotWith(note: ReturnType<typeof noteWith>, extra = {}) {
	const rest = vaultInputs({ accounts: [], months: [], ...extra }).filter((i) => !i.path.includes("/Accounts/"));
	return snapshotOf([...rest, note]);
}

describe("stale available", () => {
	it("is clean when the cache matches the balance minus the buckets", () => {
		const s = snapshotWith(noteWith([["Fund", 50000]], { availableCents: 150000 }));
		expect(detectStaleAvailable(s)).toEqual([]);
	});

	it("reads a missing cache as the balance", () => {
		expect(detectStaleAvailable(snapshotWith(noteWith([])))).toEqual([]);
		const s = snapshotWith(noteWith([["Fund", 50000]]));
		expect(detectStaleAvailable(s)).toEqual([
			{ type: "accountAvailable", path: accountPath("Cash Main"), account: "Cash Main", storedCents: 200000, actualCents: 150000 },
		]);
	});

	it("flags a hand-edited cache and offers the recalculate fix", () => {
		const [issue] = detectStaleAvailable(snapshotWith(noteWith([["Fund", 50000]], { availableCents: 1 })));
		const view = describeIssue(issue);
		expect(view.text).toBe("Cash Main: available should be 1,500.00 (stored: 0.01)");
		expect(view.fixes).toEqual([{ label: "validation.fix.recalculate", action: { kind: "recalculateBalance", account: "Cash Main" } }]);
		expect(view.auto).toBe(true);
	});

	it("skips credit cards and loans", () => {
		const card = account({ name: "Card", accountType: "creditCard", enteredBalanceCents: -100, balanceCents: -100 });
		expect(detectStaleAvailable(snapshotOf(vaultInputs({ accounts: [card], months: [] })))).toEqual([]);
	});
});

describe("negative available", () => {
	it("is clean at exactly zero", () => {
		expect(detectNegativeAvailable(snapshotWith(noteWith([["Fund", 200000]], { availableCents: 0 })))).toEqual([]);
	});

	it("flags more set aside than the account holds, as information only", () => {
		const s = snapshotWith(noteWith([["Fund", 150000], ["Trip", 100000]], { availableCents: -50000 }));
		const [issue] = detectNegativeAvailable(s);
		expect(issue).toEqual({ type: "negativeAvailable", account: "Cash Main", availableCents: -50000, balanceCents: 200000, bucketsCents: 250000 });
		const view = describeIssue(issue);
		expect(view.text).toContain("Cash Main: available is -500.00 (balance 2,000.00, buckets hold 2,500.00)");
		expect(view.text).toContain("Move money out of a bucket");
		expect(view.fixes).toEqual([]);
		expect(view.auto).toBe(false);
	});

	it("is part of a full validation run", () => {
		const s = snapshotWith(noteWith([["Fund", 250000]], { availableCents: -50000 }));
		expect(validateSnapshot(s).map((i) => i.type)).toEqual(["negativeAvailable"]);
	});
});

describe("unreadable bucket rows", () => {
	it("are reported like any other unreadable table row", () => {
		const note = noteWith([["Fund", 5]]);
		const broken = inputOf(note.path, note.content.replace("| Fund |  | 5 |", "| Fund |  | five |"));
		expect(detectMalformedRows(snapshotWith(broken))).toEqual([
			expect.objectContaining({ type: "malformedRow", path: accountPath("Cash Main"), line: 16, text: "| Fund |  | five |" }),
		]);
	});
});
