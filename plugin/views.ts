import { Plugin } from 'obsidian'
import type { Ledger } from '../services/Ledger'
import { AssetView, ASSET_VIEW_TYPE } from '../view/AssetView'
import { DashboardView, DASHBOARD_VIEW_TYPE } from '../view/DashboardView'
import { DetailView, DETAIL_VIEW_TYPE } from '../view/DetailView'

export function registerViews(plugin: Plugin, ledger: Ledger): void {
  plugin.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, ledger))
  plugin.registerView(DETAIL_VIEW_TYPE, (leaf) => new DetailView(leaf, ledger))
  plugin.registerView(ASSET_VIEW_TYPE, (leaf) => new AssetView(leaf, ledger))
}

export async function openOrRevealView(plugin: Plugin, type: string, state?: Record<string, unknown>): Promise<void> {
  const { workspace } = plugin.app
  const leaf = workspace.getLeavesOfType(type)[0] ?? workspace.getLeaf('tab')
  await leaf.setViewState({ type, active: true, state })
  void workspace.revealLeaf(leaf)
}

export const openDashboard = (plugin: Plugin) => openOrRevealView(plugin, DASHBOARD_VIEW_TYPE)
export const openAssets = (plugin: Plugin) => openOrRevealView(plugin, ASSET_VIEW_TYPE)
export const openDetail = (plugin: Plugin, yearMonth?: string) =>
  openOrRevealView(plugin, DETAIL_VIEW_TYPE, yearMonth ? { yearMonth } : undefined)
