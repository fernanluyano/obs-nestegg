// Derived from Penny Wallet's main.ts (MIT) — see NOTICE.
import { Notice, Platform, Plugin, WorkspaceLeaf } from "obsidian";
import { WalletFile } from "./io/WalletFile";
import { TransactionModal } from "./modal/TransactionModal";
import { MobileTransactionModal } from "./modal/MobileTransactionModal";
import { ValidationModal } from "./modal/ValidationModal";
import { DashboardView, DASHBOARD_VIEW_TYPE } from "./view/DashboardView";
import { DetailView, DETAIL_VIEW_TYPE } from "./view/DetailView";
import { AssetView, ASSET_VIEW_TYPE } from "./view/AssetView";
import { NesteggSettingTab } from "./settings/SettingTab";
import type { NesteggConfig, TransactionModalParams } from "./types";
import { t } from "./labels";

export default class NesteggPlugin extends Plugin {
	walletFile!: WalletFile;

	async onload() {
		this.walletFile = new WalletFile(this.app, {
			load: () => this.loadData(),
			save: (data: NesteggConfig) => this.saveData(data),
		});

		// Registrations stay synchronous so the ribbon and commands survive a slow config load.
		this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this.walletFile));
		this.registerView(DETAIL_VIEW_TYPE, (leaf) => new DetailView(leaf, this.walletFile));
		this.registerView(ASSET_VIEW_TYPE, (leaf) => new AssetView(leaf, this.walletFile));

		this.addRibbonIcon("wallet", "Nestegg", () => { void this.openDashboard(); });

		this.addCommand({ id: "open-dashboard", name: "Open finance overview", callback: () => { void this.openDashboard(); } });
		this.addCommand({ id: "open-asset", name: "Open assets", callback: () => { void this.openAssetView(); } });
		this.addCommand({ id: "open-detail", name: "Open transactions", callback: () => { void this.openDetailView(); } });
		this.addCommand({ id: "add-transaction", name: "Add transaction", callback: () => this.openTransactionModal() });
		this.addCommand({ id: "validate-data", name: "Validate data", callback: () => void this.runValidation(true) });
		this.addCommand({ id: "refresh", name: "Refresh views", callback: () => {
			this.app.workspace.trigger("nestegg:refresh");
		} });

		this.addSettingTab(new NesteggSettingTab(this.app, this, this.walletFile));

		try {
			await this.walletFile.loadConfig();
			await this.walletFile.bootstrapFrontmatter();

			if (this.walletFile.didCreateDefaultConfigOnLastLoad()) {
				new Notice(t("onboard.welcome"), 8000);
			}
			if (this.walletFile.getConfig().autoValidateOnLoad) {
				void this.runValidation(false);
			}
		} catch (e) {
			console.error("Nestegg: failed to load config", e);
			new Notice(t("notice.loadFailed"));
		}
	}

	async runValidation(showNoticeIfClean: boolean) {
		const issues = await this.walletFile.validateAllData();
		if (issues.length === 0) {
			if (showNoticeIfClean) new Notice(t("notice.validationClean"));
			return;
		}
		new ValidationModal(this.app, this.walletFile, issues).open();
	}

	async openDashboard() {
		await this.openOrRevealView(DASHBOARD_VIEW_TYPE);
	}

	async openDetailView(yearMonth?: string) {
		await this.openOrRevealView(DETAIL_VIEW_TYPE, yearMonth ? { yearMonth } : undefined);
	}

	async openAssetView() {
		await this.openOrRevealView(ASSET_VIEW_TYPE);
	}

	openTransactionModal(params: TransactionModalParams = {}) {
		const ModalClass = Platform.isMobile ? MobileTransactionModal : TransactionModal;
		new ModalClass(this.app, this.walletFile, params, null, null, () => this.refreshViews()).open();
	}

	private refreshViews() {
		for (const type of [DASHBOARD_VIEW_TYPE, DETAIL_VIEW_TYPE, ASSET_VIEW_TYPE]) {
			this.app.workspace.getLeavesOfType(type).forEach((leaf: WorkspaceLeaf) => {
				void (leaf.view as DashboardView | DetailView | AssetView).render();
			});
		}
	}

	private async openOrRevealView(type: string, state?: Record<string, unknown>) {
		const leaf = this.app.workspace.getLeavesOfType(type)[0] ?? this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type, active: true, state });
		void this.app.workspace.revealLeaf(leaf);
	}
}
