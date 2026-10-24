import { Notice, Plugin } from 'obsidian'
import { t } from '../labels'
import type { Ledger } from '../services/Ledger'
import { needsSetup } from '../snapshot/setupRules'
import { refreshViews, runValidation } from './commands'
import { openAccounts } from './views'

export async function startup(plugin: Plugin, ledger: Ledger): Promise<void> {
  try {
    await ledger.load()
    refreshViews(plugin)
    if (needsSetup(ledger.snapshot)) {
      await openAccounts(plugin)
      return
    }
    if (ledger.settings.current.autoValidateOnLoad) void runValidation(plugin, ledger, false)
  } catch (e) {
    console.error('Nestegg: failed to load', e)
    new Notice(t('notice.loadFailed'))
  }
}
