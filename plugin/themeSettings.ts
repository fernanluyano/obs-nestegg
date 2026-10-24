import { Notice, Plugin, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian'
import { DEFAULT_THEME, THEMES, THEME_ATTRIBUTE, parseTheme, themeName, type ThemeId } from '../domain/themes'
import { t, tn } from '../labels'
import type { Ledger } from '../services/Ledger'

// Display preferences live in the plugin's own data.json, not in the vault: they are per device
// (a phone and a desktop can differ) and hold no finance data.
interface StoredPrefs {
  theme?: string
}

// The palettes themselves are static rules in styles.css, switched on by this body attribute.
function applyTheme(theme: ThemeId): void {
  if (theme === DEFAULT_THEME) document.body.removeAttribute(THEME_ATTRIBUTE)
  else document.body.setAttribute(THEME_ATTRIBUTE, theme)
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

  // Obsidian 1.13+ renders (and indexes for search) these definitions and never calls display();
  // display() below is the fallback for older versions, which the manifest still supports.
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: t('settings.autoValidate'),
        desc: t('settings.autoValidateDesc'),
        control: { type: 'toggle', key: 'autoValidate' },
      },
      {
        name: t('theme.setting'),
        desc: t('theme.settingDesc'),
        control: { type: 'dropdown', key: 'theme', options: Object.fromEntries(THEMES.map(({ id }) => [id, themeName(id)])) },
      },
    ]
  }

  getControlValue(key: string): unknown {
    return key === 'theme' ? this.current() : this.ledger.settings.current.autoValidateOnLoad
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === 'theme') await this.choose(parseTheme(value))
    else this.saveAutoValidate(value === true)
  }

  private saveAutoValidate(value: boolean): void {
    this.ledger.settings.update({ autoValidateOnLoad: value }).catch((e: unknown) => {
      new Notice(tn('notice.actionFailed', { reason: e instanceof Error ? e.message : String(e) }))
    })
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
        .onChange((value) => { this.saveAutoValidate(value) }))
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

  plugin.register(() => { document.body.removeAttribute(THEME_ATTRIBUTE) })
}
