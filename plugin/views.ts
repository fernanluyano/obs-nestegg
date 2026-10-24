import { Plugin } from 'obsidian'
import type { Ledger } from '../services/Ledger'
import { AccountsView, ACCOUNTS_VIEW_TYPE } from '../view/AccountsView'
import { BudgetView, BUDGET_VIEW_TYPE } from '../view/BudgetView'
import { OverviewView, OVERVIEW_VIEW_TYPE } from '../view/OverviewView'
import { TransactionsView, TRANSACTIONS_VIEW_TYPE } from '../view/TransactionsView'
import { NetWorthView, NETWORTH_VIEW_TYPE } from '../view/NetWorthView'

export function registerViews(plugin: Plugin, ledger: Ledger): void {
  plugin.registerView(OVERVIEW_VIEW_TYPE, (leaf) => new OverviewView(leaf, ledger))
  plugin.registerView(TRANSACTIONS_VIEW_TYPE, (leaf) => new TransactionsView(leaf, ledger))
  plugin.registerView(BUDGET_VIEW_TYPE, (leaf) => new BudgetView(leaf, ledger))
  plugin.registerView(NETWORTH_VIEW_TYPE, (leaf) => new NetWorthView(leaf, ledger))
  plugin.registerView(ACCOUNTS_VIEW_TYPE, (leaf) => new AccountsView(leaf, ledger))
}

export async function openOrRevealView(plugin: Plugin, type: string, state?: Record<string, unknown>): Promise<void> {
  const { workspace } = plugin.app
  const leaf = workspace.getLeavesOfType(type)[0] ?? workspace.getLeaf('tab')
  await leaf.setViewState({ type, active: true, state })
  void workspace.revealLeaf(leaf)
}

export const openOverview = (plugin: Plugin) => openOrRevealView(plugin, OVERVIEW_VIEW_TYPE)
export const openBudget = (plugin: Plugin, yearMonth?: string) =>
  openOrRevealView(plugin, BUDGET_VIEW_TYPE, yearMonth ? { yearMonth } : undefined)
export const openNetWorth = (plugin: Plugin) => openOrRevealView(plugin, NETWORTH_VIEW_TYPE)
export const openAccounts = (plugin: Plugin) => openOrRevealView(plugin, ACCOUNTS_VIEW_TYPE)
export const openTransactions = (plugin: Plugin, yearMonth?: string) =>
  openOrRevealView(plugin, TRANSACTIONS_VIEW_TYPE, yearMonth ? { yearMonth } : undefined)
