import { Plugin } from 'obsidian'
import type { Ledger } from '../services/Ledger'
import { AccountsView, ACCOUNTS_VIEW_TYPE } from '../view/AccountsView'
import { AssetView, ASSET_VIEW_TYPE } from '../view/AssetView'
import { BudgetView, BUDGET_VIEW_TYPE } from '../view/BudgetView'
import { DashboardView, DASHBOARD_VIEW_TYPE } from '../view/DashboardView'
import { DebtView, DEBT_VIEW_TYPE } from '../view/DebtView'
import { DetailView, DETAIL_VIEW_TYPE } from '../view/DetailView'

export function registerViews(plugin: Plugin, ledger: Ledger): void {
  plugin.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, ledger))
  plugin.registerView(DETAIL_VIEW_TYPE, (leaf) => new DetailView(leaf, ledger))
  plugin.registerView(BUDGET_VIEW_TYPE, (leaf) => new BudgetView(leaf, ledger))
  plugin.registerView(ASSET_VIEW_TYPE, (leaf) => new AssetView(leaf, ledger))
  plugin.registerView(ACCOUNTS_VIEW_TYPE, (leaf) => new AccountsView(leaf, ledger))
  plugin.registerView(DEBT_VIEW_TYPE, (leaf) => new DebtView(leaf, ledger))
}

export async function openOrRevealView(plugin: Plugin, type: string, state?: Record<string, unknown>): Promise<void> {
  const { workspace } = plugin.app
  const leaf = workspace.getLeavesOfType(type)[0] ?? workspace.getLeaf('tab')
  await leaf.setViewState({ type, active: true, state })
  void workspace.revealLeaf(leaf)
}

export const openDashboard = (plugin: Plugin) => openOrRevealView(plugin, DASHBOARD_VIEW_TYPE)
export const openBudget = (plugin: Plugin, yearMonth?: string) =>
  openOrRevealView(plugin, BUDGET_VIEW_TYPE, yearMonth ? { yearMonth } : undefined)
export const openAssets =(plugin: Plugin) => openOrRevealView(plugin, ASSET_VIEW_TYPE)
export const openAccounts = (plugin: Plugin) => openOrRevealView(plugin, ACCOUNTS_VIEW_TYPE)
export const openDebt = (plugin: Plugin) => openOrRevealView(plugin, DEBT_VIEW_TYPE)
export const openDetail = (plugin: Plugin, yearMonth?: string) =>
  openOrRevealView(plugin, DETAIL_VIEW_TYPE, yearMonth ? { yearMonth } : undefined)
