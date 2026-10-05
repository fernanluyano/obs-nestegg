import { Setting } from 'obsidian'
import { t } from '../../labels'
import { activeAccounts } from '../../snapshot/queries'
import { runAction, type WizardContext } from '../WizardContext'

export function renderGeneral(container: HTMLElement, ctx: WizardContext): void {
  const { ledger } = ctx
  const { defaultAccount, autoValidateOnLoad } = ledger.settings.current
  const cashAccounts = activeAccounts(ledger.snapshot).filter(a => a.accountType === 'cash')

  new Setting(container)
    .setName(t('settings.defaultAccount'))
    .setDesc(t('settings.defaultAccountDesc'))
    .addDropdown(drop => {
      for (const a of cashAccounts) drop.addOption(a.name, a.name)
      drop.setValue(defaultAccount)
      drop.onChange((value) => { void runAction(ctx, () => ledger.settings.update({ defaultAccount: value })) })
    })

  new Setting(container)
    .setName(t('settings.autoValidate'))
    .setDesc(t('settings.autoValidateDesc'))
    .addToggle(toggle => toggle
      .setValue(autoValidateOnLoad)
      .onChange((value) => { void runAction(ctx, () => ledger.settings.update({ autoValidateOnLoad: value })) }))
}
