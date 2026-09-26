import { ArcElement, Chart, DoughnutController, Legend, Tooltip } from "chart.js";
import { App, ItemView, Modal, setIcon, setTooltip, WorkspaceLeaf } from "obsidian";
import { accountTypeName, addAccountType, type AccountType } from "./accountTypes";
import {
	addAccount,
	assetBreakdownByType,
	formatCents,
	latestBalanceCents,
	netWorthAt,
	recordSnapshot,
	type Account,
	type AccountKind,
} from "./accounts";
import type NetWorthTrackerPlugin from "./main";

Chart.register(DoughnutController, ArcElement, Legend, Tooltip);

export const VIEW_TYPE_NET_WORTH = "net-worth-tracker-view";

// Validated categorical palette (dataviz skill). A type's color comes from its
// index within the plugin's assetTypes list (its fixed "seat"), not from the
// breakdown's filtered/sorted order, so it never depends on which other types
// are present. Cycles via modulo once custom types exceed the palette length.
const ASSET_TYPE_COLOR_PALETTE: { light: string; dark: string }[] = [
	{ light: "#2a78d6", dark: "#3987e5" },
	{ light: "#eb6834", dark: "#d95926" },
	{ light: "#1baf7a", dark: "#199e70" },
	{ light: "#eda100", dark: "#c98500" },
	{ light: "#e87ba4", dark: "#d55181" },
	{ light: "#008300", dark: "#008300" },
	{ light: "#4a3aa7", dark: "#9085e9" },
];

const NEW_TYPE_SENTINEL = "__new_type__";

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

type TabId = "overview" | "debt" | "assets";

const TABS: { id: TabId; label: string }[] = [
	{ id: "overview", label: "Overview" },
	{ id: "debt", label: "Debt" },
	{ id: "assets", label: "Assets" },
];

export class NetWorthView extends ItemView {
	private plugin: NetWorthTrackerPlugin;
	// Overview leads — the net worth view should be the first thing shown,
	// not buried behind navigation.
	private activeTab: TabId = "overview";
	private charts: Chart[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: NetWorthTrackerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_NET_WORTH;
	}

	getDisplayText(): string {
		return "Net worth tracker";
	}

	getIcon(): string {
		return "wallet";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		this.destroyCharts();
		this.contentEl.empty();
	}

	private render(): void {
		this.destroyCharts();
		const root = this.contentEl;
		root.empty();
		root.addClass("nwt-view");

		this.renderTabBar(root);
		this.renderActiveTab(root);
	}

	private destroyCharts(): void {
		for (const chart of this.charts) chart.destroy();
		this.charts = [];
	}

	private renderTabBar(root: HTMLElement): void {
		const tabBar = root.createDiv({ cls: "nwt-tabs" });
		for (const tab of TABS) {
			const tabEl = tabBar.createEl("button", { cls: "nwt-tab", text: tab.label });
			tabEl.toggleClass("active", tab.id === this.activeTab);
			tabEl.addEventListener("click", () => {
				if (this.activeTab === tab.id) return;
				this.activeTab = tab.id;
				this.render();
			});
		}
	}

	private renderActiveTab(root: HTMLElement): void {
		const content = root.createDiv({ cls: "nwt-tab-content" });
		switch (this.activeTab) {
			case "overview":
				this.renderOverviewTab(content);
				break;
			case "debt":
				this.renderDebtTab(content);
				break;
			case "assets":
				this.renderAssetsTab(content);
				break;
		}
	}

	// ---------------------------------------------------------------------
	// Overview tab
	// ---------------------------------------------------------------------

	private renderOverviewTab(root: HTMLElement): void {
		const sections = ["Net Worth", "Trends", "Savings Buckets", "Assets", "Debts"];
		for (const title of sections) {
			const section = root.createDiv({ cls: "nwt-section" });
			section.createDiv({ cls: "nwt-section-header", text: title });
			const card = section.createDiv({ cls: "nwt-card" });

			if (title === "Net Worth") {
				this.renderNetWorthCard(card);
				continue;
			}
			if (title === "Assets") {
				this.renderAssetBreakdownCard(card);
				continue;
			}

			card.createEl("p", { cls: "nwt-placeholder", text: "Nothing tracked yet." });
		}
	}

	private renderNetWorthCard(card: HTMLElement): void {
		if (this.plugin.snapshots.length === 0) {
			card.createEl("p", { cls: "nwt-placeholder", text: "Nothing tracked yet." });
			return;
		}
		const total = netWorthAt(this.plugin.accounts, this.plugin.snapshots, todayIso());
		card.createEl("p", { cls: "nwt-net-worth-total", text: formatCents(total) });
	}

	private assetTypeColor(typeId: string, isDark: boolean): string {
		const index = this.plugin.assetTypes.findIndex((type) => type.id === typeId);
		const entry = ASSET_TYPE_COLOR_PALETTE[(index < 0 ? 0 : index) % ASSET_TYPE_COLOR_PALETTE.length];
		return isDark ? entry.dark : entry.light;
	}

	private renderAssetBreakdownCard(card: HTMLElement): void {
		const breakdown = assetBreakdownByType(
			this.plugin.accounts,
			this.plugin.snapshots,
			this.plugin.assetTypes,
			todayIso()
		);
		if (breakdown.length === 0) {
			card.createEl("p", { cls: "nwt-placeholder", text: "Nothing tracked yet." });
			return;
		}

		const wrap = card.createDiv({ cls: "nwt-chart-canvas-wrap" });
		const canvas = wrap.createEl("canvas");
		const isDark = document.body.classList.contains("theme-dark");
		const textColor = getComputedStyle(card).getPropertyValue("--text-normal").trim() || "#222222";

		this.charts.push(
			new Chart(canvas, {
				type: "doughnut",
				data: {
					labels: breakdown.map((entry) => entry.label),
					datasets: [
						{
							data: breakdown.map((entry) => entry.totalCents),
							backgroundColor: breakdown.map((entry) => this.assetTypeColor(entry.type, isDark)),
							borderWidth: 0,
						},
					],
				},
				options: {
					maintainAspectRatio: false,
					plugins: {
						legend: { position: "right", labels: { color: textColor } },
						tooltip: {
							callbacks: {
								label: (ctx) => `${ctx.label}: ${formatCents(breakdown[ctx.dataIndex].totalCents)}`,
							},
						},
					},
				},
			})
		);
	}

	// ---------------------------------------------------------------------
	// Debt tab
	// ---------------------------------------------------------------------

	private renderDebtTab(root: HTMLElement): void {
		this.renderStatRow(root, ["Total Debt", "Total Min. Payment", "Accounts"]);

		const header = root.createDiv({ cls: "nwt-section-header nwt-assets-header" });
		header.createSpan({ text: "Debts" });
		const actions = header.createDiv({ cls: "nwt-header-actions" });
		actions.createEl("button", { cls: "nwt-btn", text: "+ Add" }).addEventListener("click", () => {
			this.openAddAccountModal("debt");
		});

		this.renderAccountList(root, "debt", "No debts tracked yet.");
	}

	// ---------------------------------------------------------------------
	// Assets tab
	// ---------------------------------------------------------------------

	private renderAssetsTab(root: HTMLElement): void {
		const header = root.createDiv({ cls: "nwt-section-header nwt-assets-header" });
		header.createSpan({ text: "Assets" });
		const actions = header.createDiv({ cls: "nwt-header-actions" });
		actions.createEl("button", { cls: "nwt-btn", text: "+ Add" }).addEventListener("click", () => {
			this.openAddAccountModal("asset");
		});
		// Present but inert — nothing external to refresh from yet.
		actions.createEl("button", { cls: "nwt-btn", text: "Refresh" });

		this.renderAccountList(root, "asset", "No accounts tracked yet.");
	}

	// ---------------------------------------------------------------------
	// Add account — shared between the Assets and Debt tabs
	// ---------------------------------------------------------------------

	private openAddAccountModal(initialKind: AccountKind): void {
		new AddAccountModal(
			this.app,
			initialKind,
			this.plugin.assetTypes,
			this.plugin.debtTypes,
			async (kind, name) => {
				const current = kind === "asset" ? this.plugin.assetTypes : this.plugin.debtTypes;
				const updated = addAccountType(current, name);
				if (updated === current) return undefined; // no-op: blank or duplicate name
				if (kind === "asset") await this.plugin.saveAssetTypes(updated);
				else await this.plugin.saveDebtTypes(updated);
				return updated;
			},
			(name, kind, typeId, aprBps) => {
				const types = kind === "asset" ? this.plugin.assetTypes : this.plugin.debtTypes;
				void this.plugin
					.saveAccounts(addAccount(this.plugin.accounts, name, kind, typeId, types, aprBps))
					.then(() => this.render());
			}
		).open();
	}

	// Shared by the Assets and Debt tabs — same row rendering, filtered to
	// the tab's own account kind so a debt account doesn't also show up on
	// the Assets side (and vice versa).
	private renderAccountList(root: HTMLElement, kind: AccountKind, emptyText: string): void {
		const accounts = this.plugin.accounts.filter((account) => !account.archived && account.kind === kind);
		if (accounts.length === 0) {
			root.createDiv({ cls: "nwt-card" }).createEl("p", { cls: "nwt-placeholder", text: emptyText });
			return;
		}

		const list = root.createDiv({ cls: "nwt-card nwt-account-list" });
		for (const account of accounts) {
			this.renderAccountRow(list, account);
		}
	}

	private renderAccountRow(root: HTMLElement, account: Account): void {
		const row = root.createDiv({ cls: "nwt-account" });

		const info = row.createDiv({ cls: "nwt-account-info" });
		info.createSpan({ cls: "nwt-account-name", text: account.name });
		const types = account.kind === "asset" ? this.plugin.assetTypes : this.plugin.debtTypes;
		const typeLabel = accountTypeName(types, account.type);
		const meta = typeLabel ? `${account.kind} · ${typeLabel}` : account.kind;
		info.createSpan({ cls: "nwt-account-kind", text: meta });

		const balanceCents = latestBalanceCents(this.plugin.snapshots, account.id, todayIso());
		info.createSpan({
			cls: "nwt-account-balance",
			text: balanceCents === undefined ? "No balance yet" : formatCents(balanceCents),
		});

		const rowActions = row.createDiv({ cls: "nwt-row-actions" });
		this.createIconButton(rowActions, "circle-dollar-sign", "Record balance", () => {
			new RecordBalanceModal(this.app, account.name, (date, balanceCents) => {
				void this.plugin
					.saveSnapshots(recordSnapshot(this.plugin.snapshots, account.id, date, balanceCents))
					.then(() => this.render());
			}).open();
		});
	}

	// ---------------------------------------------------------------------
	// Shared primitives
	// ---------------------------------------------------------------------

	private renderStatRow(root: HTMLElement, labels: string[]): void {
		const row = root.createDiv({ cls: "nwt-stat-row" });
		for (const label of labels) {
			const stat = row.createDiv({ cls: "nwt-stat" });
			stat.createDiv({ cls: "nwt-stat-value", text: "—" });
			stat.createDiv({ cls: "nwt-stat-label", text: label });
		}
	}

	private createIconButton(root: HTMLElement, icon: string, tooltip: string, onClick: () => void): void {
		const btn = root.createEl("button", { cls: "nwt-icon-btn" });
		setIcon(btn, icon);
		setTooltip(btn, tooltip);
		btn.addEventListener("click", onClick);
	}
}

class PromptModal extends Modal {
	private value: string;

	constructor(
		app: App,
		private title: string,
		private placeholder: string,
		initialValue: string,
		private onSubmit: (value: string) => void
	) {
		super(app);
		this.value = initialValue;
	}

	onOpen(): void {
		this.contentEl.createEl("h3", { text: this.title });

		const input = this.contentEl.createEl("input", { type: "text", cls: "nwt-modal-input" });
		input.placeholder = this.placeholder;
		input.value = this.value;
		input.addEventListener("input", () => {
			this.value = input.value;
		});
		input.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter") this.submit();
		});

		const buttonRow = this.contentEl.createDiv({ cls: "nwt-modal-buttons" });
		buttonRow.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		buttonRow.createEl("button", { text: "Save", cls: "mod-cta" }).addEventListener("click", () => this.submit());

		input.focus();
		input.select();
	}

	private submit(): void {
		if (!this.value.trim()) return;
		this.close();
		this.onSubmit(this.value);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class AddAccountModal extends Modal {
	private name = "";
	private kind: AccountKind;
	private typeId = "";
	private aprText = "";
	private typeSelect!: HTMLSelectElement;
	private aprRow!: HTMLElement;

	constructor(
		app: App,
		initialKind: AccountKind,
		private assetTypes: AccountType[],
		private debtTypes: AccountType[],
		// Returns the kind's updated type list with the new type appended, or
		// undefined for a no-op (blank/duplicate name) — never throws.
		private onCreateType: (kind: AccountKind, name: string) => Promise<AccountType[] | undefined>,
		private onSubmit: (name: string, kind: AccountKind, typeId: string, aprBps: number | undefined) => void
	) {
		super(app);
		this.kind = initialKind;
	}

	private typesForKind(kind: AccountKind): AccountType[] {
		return kind === "asset" ? this.assetTypes : this.debtTypes;
	}

	onOpen(): void {
		this.contentEl.createEl("h3", { text: "New account" });

		const input = this.contentEl.createEl("input", { type: "text", cls: "nwt-modal-input" });
		input.placeholder = "e.g. Checking";
		input.addEventListener("input", () => {
			this.name = input.value;
		});
		input.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter") this.submit();
		});

		const kindSelect = this.contentEl.createEl("select", { cls: "nwt-modal-input" });
		kindSelect.createEl("option", { value: "asset", text: "Asset" });
		kindSelect.createEl("option", { value: "debt", text: "Debt" });
		kindSelect.value = this.kind;
		kindSelect.addEventListener("change", () => {
			this.kind = kindSelect.value as AccountKind;
			this.rebuildTypeOptions();
			this.aprRow.hidden = this.kind !== "debt";
		});

		this.typeSelect = this.contentEl.createEl("select", { cls: "nwt-modal-input" });
		this.typeSelect.addEventListener("change", () => {
			if (this.typeSelect.value === NEW_TYPE_SENTINEL) {
				this.promptNewType();
				return;
			}
			this.typeId = this.typeSelect.value;
		});
		this.rebuildTypeOptions();

		this.aprRow = this.contentEl.createDiv();
		const aprInput = this.aprRow.createEl("input", { type: "number", cls: "nwt-modal-input" });
		aprInput.placeholder = "APR % (optional)";
		aprInput.step = "0.01";
		aprInput.min = "0";
		aprInput.addEventListener("input", () => {
			this.aprText = aprInput.value;
		});
		this.aprRow.hidden = this.kind !== "debt";

		const buttonRow = this.contentEl.createDiv({ cls: "nwt-modal-buttons" });
		buttonRow.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		buttonRow.createEl("button", { text: "Save", cls: "mod-cta" }).addEventListener("click", () => this.submit());

		input.focus();
	}

	private rebuildTypeOptions(): void {
		this.typeSelect.empty();
		const types = this.typesForKind(this.kind);
		for (const type of types) {
			this.typeSelect.createEl("option", { value: type.id, text: type.name });
		}
		this.typeSelect.createEl("option", { value: NEW_TYPE_SENTINEL, text: "+ New type…" });
		this.typeId = types[0]?.id ?? "";
		this.typeSelect.value = this.typeId || NEW_TYPE_SENTINEL;
	}

	private promptNewType(): void {
		const kindAtPrompt = this.kind;
		new PromptModal(this.app, "New type", "e.g. Brokerage", "", (typeName) => {
			void this.onCreateType(kindAtPrompt, typeName).then((updated) => {
				if (kindAtPrompt !== this.kind) return; // kind changed while the prompt was open — ignore stale result
				if (!updated) {
					this.rebuildTypeOptions();
					return;
				}
				if (kindAtPrompt === "asset") this.assetTypes = updated;
				else this.debtTypes = updated;
				const created = updated[updated.length - 1];
				this.rebuildTypeOptions();
				this.typeId = created.id;
				this.typeSelect.value = created.id;
			});
		}).open();
	}

	private submit(): void {
		if (!this.name.trim() || !this.typeId) return;
		let aprBps: number | undefined;
		if (this.kind === "debt" && this.aprText.trim()) {
			const pct = Number.parseFloat(this.aprText);
			if (!Number.isFinite(pct) || pct < 0) return;
			// Basis points, not a float percentage — see Account.aprBps.
			aprBps = Math.round(pct * 100);
		}
		this.close();
		this.onSubmit(this.name, this.kind, this.typeId, aprBps);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class RecordBalanceModal extends Modal {
	private date = todayIso();
	private amount = "";

	constructor(
		app: App,
		private accountName: string,
		private onSubmit: (date: string, balanceCents: number) => void
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.createEl("h3", { text: `Record balance — ${this.accountName}` });

		const dateInput = this.contentEl.createEl("input", { type: "date", cls: "nwt-modal-input" });
		dateInput.value = this.date;
		dateInput.addEventListener("input", () => {
			this.date = dateInput.value;
		});

		const amountInput = this.contentEl.createEl("input", { type: "number", cls: "nwt-modal-input" });
		amountInput.placeholder = "0.00";
		amountInput.step = "0.01";
		amountInput.min = "0";
		amountInput.addEventListener("input", () => {
			this.amount = amountInput.value;
		});
		amountInput.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter") this.submit();
		});

		const buttonRow = this.contentEl.createDiv({ cls: "nwt-modal-buttons" });
		buttonRow.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		buttonRow.createEl("button", { text: "Save", cls: "mod-cta" }).addEventListener("click", () => this.submit());

		amountInput.focus();
	}

	private submit(): void {
		// Rounded rather than a bare `* 100` — floats like 19.99 * 100 can land
		// on 1998.9999999999998, which would silently truncate to the wrong cent.
		if (!this.date) return;
		const dollars = Number.parseFloat(this.amount);
		if (!Number.isFinite(dollars) || dollars < 0) return;
		const balanceCents = Math.round(dollars * 100);
		this.close();
		this.onSubmit(this.date, balanceCents);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
