import { currentBalance } from "../domain/accounts";
import { bucketsTotal } from "../domain/buckets";
import { patchProps, type Props } from "../notes/frontmatter";
import { accountTransactions } from "../snapshot/snapshot";
import type { LedgerStore } from "./LedgerStore";

// Refreshes the cached `balanceCents` (and, on a cash account, `availableCents`) on the given
// accounts from their rows and buckets, writing only the notes whose cache is actually out of date.
export async function syncBalances(store: LedgerStore, names: string[]): Promise<void> {
	for (const name of new Set(names)) {
		const record = store.snapshot.accounts.find((a) => a.account.name === name);
		if (!record) continue;
		const cents = currentBalance(record.account, accountTransactions(store.snapshot, name));
		const patch: Props = {};
		if (cents !== record.account.balanceCents) patch.balanceCents = cents;
		const isCash = record.account.accountType === "cash";
		const available = cents - bucketsTotal(record.buckets);
		if (isCash && record.account.availableCents !== available) patch.availableCents = available;
		if (Object.keys(patch).length === 0) continue;
		await store.port.modify(record.path, (content) => patchProps(content, patch));
		store.setAccountAmounts(name, cents, isCash ? available : undefined);
	}
}
