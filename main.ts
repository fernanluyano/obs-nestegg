import { Plugin, WorkspaceLeaf } from "obsidian";
import { NetWorthView, VIEW_TYPE_NET_WORTH } from "./view";
import { SEED_ASSET_TYPE_NAMES, SEED_DEBT_TYPE_NAMES, seedAccountTypes, type AccountType } from "./accountTypes";
import type { Account, Snapshot } from "./accounts";
import { CURRENT_SCHEMA_VERSION, migrateToV3, type LegacyPluginDataV2 } from "./migrations";

interface PluginData {
	schemaVersion: number;
	accounts: Account[];
	snapshots: Snapshot[];
	assetTypes: AccountType[];
	debtTypes: AccountType[];
}

export default class NetWorthTrackerPlugin extends Plugin {
	accounts: Account[] = [];
	snapshots: Snapshot[] = [];
	assetTypes: AccountType[] = [];
	debtTypes: AccountType[] = [];

	async onload(): Promise<void> {
		await this.loadPluginData();

		this.registerView(VIEW_TYPE_NET_WORTH, (leaf) => new NetWorthView(leaf, this));

		this.addRibbonIcon("wallet", "Net worth tracker", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-net-worth-tracker",
			name: "Open net worth tracker",
			callback: () => {
				void this.activateView();
			},
		});
	}

	async activateView(): Promise<NetWorthView> {
		const { workspace } = this.app;

		const existing = workspace.getLeavesOfType(VIEW_TYPE_NET_WORTH);
		const leaf: WorkspaceLeaf = existing.length > 0 ? existing[0] : workspace.getLeaf(true);

		if (existing.length === 0) {
			await leaf.setViewState({ type: VIEW_TYPE_NET_WORTH, active: true });
		}
		await workspace.revealLeaf(leaf);
		return leaf.view as NetWorthView;
	}

	async loadPluginData(): Promise<void> {
		const data = ((await this.loadData()) ?? {}) as Partial<PluginData>;
		const schemaVersion = data.schemaVersion ?? 1;

		let needsPersist = false;

		if (schemaVersion >= CURRENT_SCHEMA_VERSION) {
			this.accounts = data.accounts ?? [];
			this.snapshots = data.snapshots ?? [];
			this.assetTypes = data.assetTypes ?? [];
			this.debtTypes = data.debtTypes ?? [];
		} else {
			const migrated = migrateToV3(data as LegacyPluginDataV2);
			this.accounts = migrated.accounts;
			this.snapshots = migrated.snapshots;
			this.assetTypes = migrated.assetTypes;
			this.debtTypes = migrated.debtTypes;
			needsPersist = true;
		}

		// Account types are new as of schema v2, so a vault already migrated
		// to v2/v3 but predating the type-picker feature still has empty
		// lists here — seed them once, same as a fresh install.
		if (this.assetTypes.length === 0) {
			this.assetTypes = seedAccountTypes(SEED_ASSET_TYPE_NAMES);
			needsPersist = true;
		}
		if (this.debtTypes.length === 0) {
			this.debtTypes = seedAccountTypes(SEED_DEBT_TYPE_NAMES);
			needsPersist = true;
		}

		// Persist immediately so a vault re-opened without being edited still
		// ends up seeded instead of stuck on the old shape.
		if (needsPersist) await this.persist();
	}

	async saveAccounts(accounts: Account[]): Promise<void> {
		this.accounts = accounts;
		await this.persist();
	}

	async saveSnapshots(snapshots: Snapshot[]): Promise<void> {
		this.snapshots = snapshots;
		await this.persist();
	}

	async saveAssetTypes(assetTypes: AccountType[]): Promise<void> {
		this.assetTypes = assetTypes;
		await this.persist();
	}

	async saveDebtTypes(debtTypes: AccountType[]): Promise<void> {
		this.debtTypes = debtTypes;
		await this.persist();
	}

	private async persist(): Promise<void> {
		const data: PluginData = {
			schemaVersion: CURRENT_SCHEMA_VERSION,
			accounts: this.accounts,
			snapshots: this.snapshots,
			assetTypes: this.assetTypes,
			debtTypes: this.debtTypes,
		};
		await this.saveData(data);
	}
}
