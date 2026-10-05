import { Notice, Platform, Plugin } from 'obsidian'
import type { TransactionModalParams } from '../domain/types'
import { t } from '../labels'
import { MobileTransactionModal } from '../modal/MobileTransactionModal'
import { TransactionModal } from '../modal/TransactionModal'
import { ValidationModal } from '../modal/ValidationModal'
import type { Ledger } from '../services/Ledger'
import { SetupWizard } from '../wizard/SetupWizard'
import { openAssets, openDashboard, openDetail } from './views'

export function openSetupWizard(plugin: Plugin, ledger: Ledger): void {
  new SetupWizard(plugin.app, ledger).open()
}

export function refreshViews(plugin: Plugin): void {
  plugin.app.workspace.trigger('nestegg:refresh')
}

export function openTransactionModal(plugin: Plugin, ledger: Ledger, params: TransactionModalParams = {}): void {
  const ModalClass = Platform.isMobile ? MobileTransactionModal : TransactionModal
  new ModalClass(plugin.app, ledger, params, null, () => refreshViews(plugin)).open()
}

export async function runValidation(plugin: Plugin, ledger: Ledger, showNoticeIfClean: boolean): Promise<void> {
  const issues = await ledger.validation.validate()
  if (issues.length === 0) {
    if (showNoticeIfClean) new Notice(t('notice.validationClean'))
    return
  }
  new ValidationModal(plugin.app, ledger, issues, () => refreshViews(plugin)).open()
}

export function registerCommands(plugin: Plugin, ledger: Ledger): void {
  plugin.addRibbonIcon('wallet', 'Nestegg', () => { void openDashboard(plugin) })
  plugin.addCommand({ id: 'open-dashboard', name: 'Open finance overview', callback: () => { void openDashboard(plugin) } })
  plugin.addCommand({ id: 'open-asset', name: 'Open assets', callback: () => { void openAssets(plugin) } })
  plugin.addCommand({ id: 'open-detail', name: 'Open transactions', callback: () => { void openDetail(plugin) } })
  plugin.addCommand({ id: 'add-transaction', name: 'Add transaction', callback: () => openTransactionModal(plugin, ledger) })
  plugin.addCommand({ id: 'setup', name: 'Set up accounts and categories', callback: () => openSetupWizard(plugin, ledger) })
  plugin.addCommand({ id: 'validate-data', name: 'Validate data', callback: () => { void runValidation(plugin, ledger, true) } })
  plugin.addCommand({ id: 'refresh', name: 'Refresh views', callback: () => { void ledger.reload().then(() => refreshViews(plugin)) } })
}
