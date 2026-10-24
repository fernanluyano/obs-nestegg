import { Notice, Platform, Plugin } from 'obsidian'
import type { TransactionModalParams } from '../domain/types'
import { t } from '../labels'
import { EntryFormModal } from '../modal/EntryFormModal'
import { MobileEntryFormModal } from '../modal/MobileEntryFormModal'
import { IssueReviewModal } from '../modal/IssueReviewModal'
import type { Ledger } from '../services/Ledger'
import { NESTEGG_ICON } from './icon'
import { openAccounts, openBudget, openOverview, openTransactions, openNetWorth } from './views'

export function refreshViews(plugin: Plugin): void {
  plugin.app.workspace.trigger('nestegg:refresh')
}

export function openTransactionModal(plugin: Plugin, ledger: Ledger, params: TransactionModalParams = {}): void {
  const ModalClass = Platform.isMobile ? MobileEntryFormModal : EntryFormModal
  new ModalClass(plugin.app, ledger, params, null, () => refreshViews(plugin)).open()
}

export async function runValidation(plugin: Plugin, ledger: Ledger, showNoticeIfClean: boolean): Promise<void> {
  const issues = await ledger.validation.validate()
  if (issues.length === 0) {
    if (showNoticeIfClean) new Notice(t('notice.validationClean'))
    return
  }
  new IssueReviewModal(plugin.app, ledger, issues, () => refreshViews(plugin)).open()
}

export function registerCommands(plugin: Plugin, ledger: Ledger): void {
  plugin.addRibbonIcon(NESTEGG_ICON, 'Nestegg', () => { void openOverview(plugin) })
  plugin.addCommand({ id: 'open-dashboard', name: 'Open expenses history', callback: () => { void openOverview(plugin) } })
  plugin.addCommand({ id: 'open-networth', name: 'Open net worth', callback: () => { void openNetWorth(plugin) } })
  plugin.addCommand({ id: 'open-accounts', name: 'Open accounts', callback: () => { void openAccounts(plugin) } })
  plugin.addCommand({ id: 'open-detail', name: 'Open transactions', callback: () => { void openTransactions(plugin) } })
  plugin.addCommand({ id: 'open-budget', name: 'Open budget', callback: () => { void openBudget(plugin) } })
  plugin.addCommand({ id: 'add-transaction', name: 'Add transaction', callback: () => openTransactionModal(plugin, ledger) })
  plugin.addCommand({ id: 'validate-data', name: 'Validate data', callback: () => { void runValidation(plugin, ledger, true) } })
  plugin.addCommand({ id: 'refresh', name: 'Refresh views', callback: () => { void ledger.reload().then(() => refreshViews(plugin)) } })
}
