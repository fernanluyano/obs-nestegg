import { Plugin } from 'obsidian'
import { registerCommands } from './plugin/commands'
import { registerIcon } from './plugin/icon'
import { startup } from './plugin/startup'
import { registerThemeSettings } from './plugin/themeSettings'
import { registerViews } from './plugin/views'
import { Ledger } from './services/Ledger'
import { ObsidianVault } from './storage/ObsidianVault'

export default class NesteggPlugin extends Plugin {
  ledger!: Ledger

  onload() {
    this.ledger = new Ledger(new ObsidianVault(this.app))

    // Registrations stay synchronous so the ribbon and commands survive a slow vault load.
    registerIcon()
    void registerThemeSettings(this)
    registerViews(this, this.ledger)
    registerCommands(this, this.ledger)

    this.app.workspace.onLayoutReady(() => { void startup(this, this.ledger) })
  }
}
