import { currentBalance } from "../domain/accounts";
import { patchProps } from "../notes/frontmatter";
import { accountTransactions } from "../snapshot/snapshot";
import type { LedgerStore } from "./LedgerStore";

// Refreshes the cached `balanceCents` on the given accounts from their rows, writing only the
// notes whose cache is actually out of date.
export async function syncBalances(store: LedgerStore, names: string[]): Promise<void> {
	for (const name of new Set(names)) {
		const record = store.snapshot.accounts.find((a) => a.account.name === name);
		if (!record) continue;
		const cents = currentBalance(record.account, accountTransactions(store.snapshot, name));
		if (cents === record.account.balanceCents) continue;
		await store.port.modify(record.path, (content) => patchProps(content, { balanceCents: cents }));
		store.setAccountBalance(name, cents);
	}
}
