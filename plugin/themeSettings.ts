import { Notice, Plugin, PluginSettingTab, Setting } from 'obsidian'
import { DEFAULT_THEME, THEMES, parseTheme, themeCss, themeName, type ThemeId } from '../domain/themes'
import { t, tn } from '../labels'
import type { Ledger } from '../services/Ledger'

// Display preferences live in the plugin's own data.json, not in the vault: they are per device
// (a phone and a desktop can differ) and hold no finance data.
interface StoredPrefs {
  theme?: string
}

const STYLE_ID = 'nestegg-theme'

function applyTheme(theme: ThemeId): void {
  let el = document.getElementById(STYLE_ID)
  if (!el) {
    el = document.head.createEl('style', { attr: { id: STYLE_ID } })
  }
  el.textContent = themeCss(theme)
}

class NesteggSettingTab extends PluginSettingTab {
  constructor(
    plugin: Plugin,
    private ledger: Ledger,
    private current: () => ThemeId,
    private choose: (theme: ThemeId) => Promise<void>,
  ) {
    super(plugin.app, plugin)
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()
    // Unlike the theme this lives in the vault's settings note, so it follows the data, not the device.
    new Setting(containerEl)
      .setName(t('settings.autoValidate'))
      .setDesc(t('settings.autoValidateDesc'))
      .addToggle(toggle => toggle
        .setValue(this.ledger.settings.current.autoValidateOnLoad)
        .onChange((value) => {
          this.ledger.settings.update({ autoValidateOnLoad: value }).catch((e: unknown) => {
            new Notice(tn('notice.actionFailed', { reason: e instanceof Error ? e.message : String(e) }))
          })
        }))
    new Setting(containerEl)
      .setName(t('theme.setting'))
      .setDesc(t('theme.settingDesc'))
      .addDropdown(drop => {
        for (const { id } of THEMES) drop.addOption(id, themeName(id))
        drop.setValue(this.current())
        drop.onChange((value) => { void this.choose(parseTheme(value)) })
      })
  }
}

export async function registerThemeSettings(plugin: Plugin, ledger: Ledger): Promise<void> {
  const stored = ((await plugin.loadData()) ?? {}) as StoredPrefs
  let theme = parseTheme(stored.theme ?? DEFAULT_THEME)
  applyTheme(theme)

  plugin.addSettingTab(new NesteggSettingTab(plugin, ledger, () => theme, async (next) => {
    theme = next
    applyTheme(theme)
    await plugin.saveData({ ...stored, theme })
    plugin.app.workspace.trigger('nestegg:refresh')
  }))

  plugin.register(() => { document.getElementById(STYLE_ID)?.remove() })
}
