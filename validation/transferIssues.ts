import { buildCategoryIndex } from "../domain/categories";
import type { Snapshot } from "../snapshot/snapshot";
import type { TransferIssue, TransferProblem } from "./issues";

interface Row {
	path: string;
	account: string;
	date: string;
	subcategory: string;
	amountCents: number;
	fromTo: string;
}

const key = (account: string, other: string, date: string, subcategory: string, amount: number) =>
	[account, other, date, subcategory, amount].join("\u0000");

// Transfers are two rows, one per account. A row is matched with a partner that points back at it
// on the same date and subcategory with the exact opposite amount; each partner pairs only once.
export function detectTransferIssues(snapshot: Snapshot): TransferIssue[] {
	const index = buildCategoryIndex(snapshot.categories.map((c) => c.category));
	const issues: TransferIssue[] = [];
	const transferRows: Row[] = [];

	for (const m of snapshot.months) {
		for (const tx of m.transactions) {
			const row: Row = { path: m.path, account: m.account, ...tx };
			const isTransfer = index.typeOf(tx.subcategory) === "transfer";
			const problem = rowProblem(row, isTransfer);
			if (problem) issues.push(issueOf(problem, row));
			else if (isTransfer) transferRows.push(row);
		}
	}

	const available = new Map<string, number>();
	for (const r of transferRows) {
		const k = key(r.account, r.fromTo, r.date, r.subcategory, r.amountCents);
		available.set(k, (available.get(k) ?? 0) + 1);
	}
	for (const r of transferRows) {
		const partner = key(r.fromTo, r.account, r.date, r.subcategory, -r.amountCents);
		const left = available.get(partner) ?? 0;
		if (left > 0) available.set(partner, left - 1);
		else issues.push(issueOf("noPartner", r));
	}
	return issues;
}

function rowProblem(row: Row, isTransfer: boolean): TransferProblem | null {
	if (!isTransfer) return row.fromTo === "" ? null : "fromToOnNonTransfer";
	if (row.fromTo === "") return "missingFromTo";
	if (row.fromTo === row.account) return "sameAccount";
	return null;
}

function issueOf(problem: TransferProblem, r: Row): TransferIssue {
	return { type: "transfer", problem, path: r.path, account: r.account, date: r.date, fromTo: r.fromTo, amountCents: r.amountCents };
}
