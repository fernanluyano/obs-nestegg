import { describe, expect, it } from "vitest";
import { addBucketRow } from "../../notes/bucketTable";
import { buildAccountNote } from "../../notes/accountNote";
import { accountPath } from "../../notes/paths";
import { availability, bucketsOf } from "../../snapshot/queries";
import { buildSnapshot } from "../../snapshot/snapshot";
import { account, inputOf, monthInput, tx, vaultInputs } from "../helpers/fixtures";

function note(name: string, buckets: [string, number][], over = {}) {
	let content = buildAccountNote(account({ name, ...over }));
	for (const [bucket, balanceCents] of buckets) content = addBucketRow(content, { name: bucket, balanceCents });
	return inputOf(accountPath(name), content);
}

const others = vaultInputs({ accounts: [], months: [monthInput("Cash Main", "2026-10", [tx({ amountCents: -8450 })])] })
	.filter((i) => !i.path.includes("/Accounts/Cash Main/Cash Main"));

describe("buckets in the snapshot", () => {
	it("are read from a cash account's note body", () => {
		const snap = buildSnapshot([...others, note("Cash Main", [["Fund", 50000], ["Trip", 1000]])]);
		expect(snap.accounts[0].buckets).toEqual([{ name: "Fund", balanceCents: 50000 }, { name: "Trip", balanceCents: 1000 }]);
		expect(snap.accounts[0].bucketIssues).toEqual([]);
	});

	it("are empty for an account with no table, and never read for a credit card", () => {
		const card = note("Card", [["Fund", 5]], { accountType: "creditCard", enteredBalanceCents: -1, balanceCents: -1 });
		const snap = buildSnapshot([...others, note("Cash Main", []), card]);
		expect(snap.accounts.map((a) => a.buckets)).toEqual([[], []]);
	});

	it("carry unreadable rows as issues", () => {
		const good = note("Cash Main", [["Fund", 5]]);
		const snap = buildSnapshot([...others, inputOf(good.path, good.content.replace("| Fund |  | 5 |", "| Fund |  | x |"))]);
		expect(snap.accounts[0].buckets).toEqual([]);
		expect(snap.accounts[0].bucketIssues).toHaveLength(1);
	});
});

describe("bucket queries", () => {
	const snap = buildSnapshot([...others, note("Cash Main", [["Fund", 50000]])]);

	it("lists an account's buckets, none for an unknown account", () => {
		expect(bucketsOf(snap, "Cash Main")).toEqual([{ name: "Fund", balanceCents: 50000 }]);
		expect(bucketsOf(snap, "Nope")).toEqual([]);
	});

	it("computes available from the rows, not the cache", () => {
		expect(availability(snap, "Cash Main")).toEqual({ balanceCents: 200000 - 8450, bucketsCents: 50000, availableCents: 200000 - 8450 - 50000 });
		expect(availability(snap, "Nope")).toBeUndefined();
	});
});
