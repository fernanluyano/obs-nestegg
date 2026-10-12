import type { Snapshot } from "../snapshot/snapshot";
import type { VaultPort } from "../storage/VaultPort";
import { AccountService, type NewAccount } from "./AccountService";
import { AssetService } from "./AssetService";
import { BucketService } from "./BucketService";
import { BudgetService } from "./BudgetService";
import { CategoryService } from "./CategoryService";
import { LedgerStore } from "./LedgerStore";
import { seedVault, isEmptyVault } from "./seed";
import { SettingsService } from "./SettingsService";
import { TransactionService } from "./TransactionService";
import { ValidationService } from "./ValidationService";

// The one object views and modals hold: read the current snapshot, write through a service.
export class Ledger {
	readonly store: LedgerStore;
	readonly transactions: TransactionService;
	readonly accounts: AccountService;
	readonly assets: AssetService;
	readonly categories: CategoryService;
	readonly buckets: BucketService;
	readonly budgets: BudgetService;
	readonly settings: SettingsService;
	readonly validation: ValidationService;

	constructor(port: VaultPort) {
		this.store = new LedgerStore(port);
		this.transactions = new TransactionService(this.store);
		this.accounts = new AccountService(this.store);
		this.assets = new AssetService(this.store);
		this.categories = new CategoryService(this.store);
		this.buckets = new BucketService(this.store);
		this.budgets = new BudgetService(this.store);
		this.settings = new SettingsService(this.store);
		this.validation = new ValidationService(this.store, this.settings);
	}

	get snapshot(): Snapshot {
		return this.store.snapshot;
	}

	// Reads the vault, laying out the starter categories first if it holds no Nestegg notes at all.
	async load(): Promise<void> {
		const first = await this.store.reload();
		if (!isEmptyVault(first)) return;
		await seedVault(this.store.port);
		await this.store.reload();
	}

	// The default account must be an active cash account.
	private hasUsableDefault(): boolean {
		const wanted = this.settings.current.defaultAccount;
		return this.snapshot.accounts.some((a) => a.account.name === wanted && a.account.active && a.account.accountType === "cash");
	}

	// The first cash account a user adds becomes the default, so adding a transaction preselects it.
	async addAccount(input: NewAccount): Promise<void> {
		await this.accounts.create(input);
		if (input.accountType === "cash" && !this.hasUsableDefault()) {
			await this.settings.update({ defaultAccount: input.name });
		}
	}

	// Archiving the default account hands the default to another active cash account, or clears it.
	async archiveAccount(name: string): Promise<void> {
		await this.accounts.setActive(name, false);
		if (this.hasUsableDefault()) return;
		const next = this.snapshot.accounts.find((a) => a.account.active && a.account.accountType === "cash");
		await this.settings.update({ defaultAccount: next?.account.name ?? "" });
	}

	reload(): Promise<Snapshot> {
		return this.store.reload();
	}
}
