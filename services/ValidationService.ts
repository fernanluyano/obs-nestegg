import { currentBalance } from "../domain/accounts";
import { DEFAULT_ACCOUNT_COLOR } from "../domain/colors";
import { buildAccountNote } from "../notes/accountNote";
import { refreshTotals } from "../notes/monthNote";
import { accountPath } from "../notes/paths";
import { discardTransit, promoteTransit } from "../rename/recovery";
import { activeAccounts } from "../snapshot/queries";
import { accountTransactions } from "../snapshot/snapshot";
import { cleanupEmptyFolders } from "../storage/folders";
import type { ValidationIssue } from "../validation/issues";
import { validateSnapshot } from "../validation/validate";
import { syncBalances } from "./balances";
import { LedgerError } from "./errors";
import type { LedgerStore } from "./LedgerStore";
import type { SettingsService } from "./SettingsService";

// Reports what it cannot read and offers explicit fixes; nothing here runs without being asked.
export class ValidationService {
	constructor(private store: LedgerStore, private settings: SettingsService) {}

	async validate(): Promise<ValidationIssue[]> {
		return validateSnapshot(await this.store.reload());
	}

	async recalculateMonthTotals(path: string): Promise<void> {
		const month = this.store.snapshot.months.find((m) => m.path === path);
		if (!month) throw new LedgerError("That month is no longer in the vault");
		await this.store.port.modify(path, (c) => refreshTotals(c, month.transactions, this.store.index));
		await this.store.reload();
	}

	async recalculateBalance(account: string): Promise<void> {
		await syncBalances(this.store, [account]);
		await this.store.reload();
	}

	// Gives stranded month files an account to belong to. It is archived and out of net asset,
	// because the user never said what its balance was.
	async createMissingAccount(name: string, today: string): Promise<void> {
		const account = {
			name, accountType: "cash" as const, active: false, includeInNetAsset: false,
			enteredBalanceCents: 0, enteredBalanceAsOf: today, balanceCents: 0, availableCents: 0, color: DEFAULT_ACCOUNT_COLOR,
		};
		account.balanceCents = currentBalance(account, accountTransactions(this.store.snapshot, name));
		account.availableCents = account.balanceCents;
		await this.store.port.create(accountPath(name), buildAccountNote(account));
		await this.store.reload();
	}

	async resetDefaultAccount(): Promise<void> {
		const first = activeAccounts(this.store.snapshot).find((a) => a.accountType === "cash");
		if (!first) throw new LedgerError("There is no active cash account to use as the default");
		await this.settings.update({ defaultAccount: first.name });
	}

	async moveToExpectedPath(path: string, expectedPath: string): Promise<void> {
		if (this.store.port.exists(expectedPath)) throw new LedgerError(`${expectedPath} already exists`);
		await this.store.port.rename(path, expectedPath);
		await cleanupEmptyFolders(this.store.port, [path]);
		await this.store.reload();
	}

	async promoteInTransit(path: string): Promise<void> {
		await promoteTransit(this.store.port, path);
		await this.store.reload();
	}

	async discardInTransit(path: string): Promise<void> {
		await discardTransit(this.store.port, path);
		await this.store.reload();
	}
}
