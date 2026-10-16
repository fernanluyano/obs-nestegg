import { Plugin, PluginSettingTab, Setting } from 'obsidian'
import { DEFAULT_THEME, THEMES, parseTheme, themeCss, themeName, type ThemeId } from '../domain/themes'
import { t } from '../labels'

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
  constructor(plugin: Plugin, private current: () => ThemeId, private choose: (theme: ThemeId) => Promise<void>) {
    super(plugin.app, plugin)
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()
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

export async function registerThemeSettings(plugin: Plugin): Promise<void> {
  const stored = ((await plugin.loadData()) ?? {}) as StoredPrefs
  let theme = parseTheme(stored.theme ?? DEFAULT_THEME)
  applyTheme(theme)

  plugin.addSettingTab(new NesteggSettingTab(plugin, () => theme, async (next) => {
    theme = next
    applyTheme(theme)
    await plugin.saveData({ ...stored, theme })
    plugin.app.workspace.trigger('nestegg:refresh')
  }))

  plugin.register(() => { document.getElementById(STYLE_ID)?.remove() })
}
