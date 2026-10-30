import { Notice, Plugin } from 'obsidian'
import { t } from '../labels'
import { isInsideRoot } from '../notes/paths'
import type { Ledger } from '../services/Ledger'
import { createReloadScheduler } from '../storage/reloadScheduler'
import { needsSetup } from '../snapshot/setupRules'
import { refreshViews, runValidation } from './commands'
import { openAccounts } from './views'

const RELOAD_DELAY_MS = 500

// Edits synced in from another device arrive as ordinary file events, so the cached snapshot is
// rebuilt from disk. Registered after layout is ready: before that Obsidian emits a create event
// for every file in the vault.
function watchExternalChanges(plugin: Plugin, ledger: Ledger): void {
  const scheduler = createReloadScheduler(async () => {
    await ledger.reload()
    refreshViews(plugin)
  }, RELOAD_DELAY_MS)
  const touch = (...paths: string[]): void => {
    if (paths.some(isInsideRoot)) scheduler.notify()
  }
  const { vault } = plugin.app
  plugin.registerEvent(vault.on('modify', (f) => touch(f.path)))
  plugin.registerEvent(vault.on('create', (f) => touch(f.path)))
  plugin.registerEvent(vault.on('delete', (f) => touch(f.path)))
  plugin.registerEvent(vault.on('rename', (f, oldPath) => touch(f.path, oldPath)))
  plugin.register(() => scheduler.cancel())
}

export async function startup(plugin: Plugin, ledger: Ledger): Promise<void> {
  try {
    await ledger.load()
    watchExternalChanges(plugin, ledger)
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
