import type { CategoryIndex } from "../domain/categories";
import { MonthDeltaCache } from "../snapshot/runningBalance";
import { categoryIndexOf, emptySnapshot, type Snapshot } from "../snapshot/snapshot";
import { loadSnapshot } from "../storage/loader";
import type { VaultPort } from "../storage/VaultPort";

// The one in-memory copy of the vault that the services read and refresh after each write.
export class LedgerStore {
	private current: Snapshot = emptySnapshot();
	private currentIndex: CategoryIndex = categoryIndexOf(this.current);

	readonly monthDeltas = new MonthDeltaCache();

	constructor(readonly port: VaultPort) {}

	get snapshot(): Snapshot {
		return this.current;
	}

	get index(): CategoryIndex {
		return this.currentIndex;
	}

	// Passing the months whose rows changed keeps the other months' cached sums; any other reload
	// (account edits, renames, fixes) drops them all.
	async reload(changedMonths?: string[]): Promise<Snapshot> {
		this.current = await loadSnapshot(this.port);
		this.currentIndex = categoryIndexOf(this.current);
		if (changedMonths) this.monthDeltas.invalidate(changedMonths);
		else this.monthDeltas.clear();
		return this.current;
	}

	// After patching an account note's cached amounts, keep memory in step without a full reload.
	setAccountAmounts(name: string, balanceCents: number, availableCents?: number): void {
		const record = this.current.accounts.find((a) => a.account.name === name);
		if (record) record.account = { ...record.account, balanceCents, ...(availableCents === undefined ? {} : { availableCents }) };
	}
}
