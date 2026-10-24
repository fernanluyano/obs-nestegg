import { Notice, Setting } from 'obsidian'
import type { Account } from '../../domain/types'
import { t, tn } from '../../labels'
import { ConfirmDialog } from '../../modal/ConfirmDialog'
import { accountHasTransactions, bucketsOf } from '../../snapshot/queries'
import { canRemoveAccount, cashAccountCheck, activeCashAccounts } from '../../snapshot/setupRules'
import { runAction, type ActionContext } from '../actionContext'

// The last active cash account can't be archived or deleted; the rest ask first. An account with
// transactions is archived (kept, restorable), one without is deleted.
export function renderRemoveButton(actions: HTMLElement, ctx: ActionContext, account: Account): void {
  const hasRows = accountHasTransactions(ctx.ledger.snapshot, account.name)
  const button = actions.createEl('button', { text: hasRows ? t('ui.archive') : t('ui.delete'), cls: 'mod-warning' })
  button.addEventListener('click', () => removeAccount(ctx, account, hasRows))
}

function removeAccount(ctx: ActionContext, account: Account, hasRows: boolean): void {
  const allowed = canRemoveAccount(ctx.ledger.snapshot, account.name)
  if (!allowed.ok) { new Notice(t(allowed.reason)); return }
  const hasBuckets = bucketsOf(ctx.ledger.snapshot, account.name).length > 0
  const key = hasRows
    ? (hasBuckets ? 'wizard.confirm.archiveAccountBuckets' : 'wizard.confirm.archiveAccount')
    : (hasBuckets ? 'wizard.confirm.deleteAccountBuckets' : 'wizard.confirm.deleteAccount')
  const message = tn(key, { name: account.name })
  new ConfirmDialog(ctx.app, message, async () => {
    await runAction(ctx, () => (hasRows ? ctx.ledger.archiveAccount(account.name) : ctx.ledger.accounts.remove(account.name)))
  }).open()
}

// Shown while there is no active cash account: every other screen needs one.
export function renderCashAccountNeeded(container: HTMLElement, ctx: ActionContext): void {
  const check = cashAccountCheck(ctx.ledger.snapshot)
  if (check.ok) return
  container.createDiv({ text: t('accounts.needCash'), cls: 'ne-wizard-callout' })
}

// Only an active cash account can be the default; the choice is refused otherwise by the ledger.
export function renderDefaultAccount(container: HTMLElement, ctx: ActionContext): void {
  const cash = activeCashAccounts(ctx.ledger.snapshot)
  if (cash.length === 0) return
  const { defaultAccount } = ctx.ledger.settings.current
  new Setting(container)
    .setName(t('settings.defaultAccount'))
    .setDesc(t('settings.defaultAccountDesc'))
    .addDropdown(drop => {
      for (const a of cash) drop.addOption(a.name, a.name)
      drop.setValue(defaultAccount)
      drop.onChange((value) => { void runAction(ctx, () => ctx.ledger.setDefaultAccount(value)) })
    })
}

export function renderArchivedAccounts(container: HTMLElement, ctx: ActionContext): void {
  const archived = ctx.ledger.snapshot.accounts.map(a => a.account).filter(a => !a.active)
  if (archived.length === 0) return
  const card = container.createDiv('ne-card')
  card.createEl('h4', { text: t('settings.archivedAccounts') })
  const group = card.createDiv('ne-settings-group')

  for (const account of archived) {
    const row = group.createDiv('ne-wallet-row')
    const info = row.createDiv('ne-wallet-row-info')
    info.createSpan({ text: account.name, cls: 'ne-wallet-row-name' })
    info.createSpan({ text: t(`label.accountType.${account.accountType}`), cls: `ne-wallet-badge ne-badge-${account.accountType}` })
    info.createSpan({
      text: account.includeInNetAsset ? t('settings.includeInNetAssetOn') : t('settings.includeInNetAssetOff'),
      cls: 'ne-wallet-row-desc',
    })

    const actions = row.createDiv('ne-wallet-row-actions')
    const toggle = actions.createDiv({ cls: 'checkbox-container' + (account.includeInNetAsset ? ' is-enabled' : '') })
    toggle.createEl('input', { type: 'checkbox' }).checked = account.includeInNetAsset
    toggle.addEventListener('click', () => {
      void runAction(ctx, () => ctx.ledger.accounts.update(account.name, { includeInNetAsset: !account.includeInNetAsset }))
    })
    actions.createEl('button', { text: t('ui.unarchive') }).addEventListener('click', () => {
      new ConfirmDialog(ctx.app, t('confirm.unarchiveAccount'), async () => {
        await runAction(ctx, () => ctx.ledger.accounts.setActive(account.name, true))
      }).open()
    })
  }
}
