import { Notice } from 'obsidian'
import { formatCents } from '../../domain/money'
import type { Account, AccountType } from '../../domain/types'
import { t, tn } from '../../labels'
import { ConfirmModal } from '../../modal/ConfirmModal'
import { openAccountEdit } from '../../modal/editAccountFlow'
import { accountBalances, accountHasTransactions } from '../../snapshot/queries'
import { canRemoveAccount } from '../model'
import { runAction, type WizardContext } from '../WizardContext'
import { renderAddAccountForm } from './addAccountForm'

export function renderAccounts(container: HTMLElement, ctx: WizardContext): void {
  container.createEl('p', { text: t('wizard.accounts.intro') })
  renderActive(container, ctx)
  renderArchived(container, ctx)
  container.createEl('h4', { text: t('settings.addAccount') })
  renderAddAccountForm(container, ctx)
}

function badge(parent: HTMLElement, type: AccountType) {
  parent.createSpan({ text: t(`label.accountType.${type}`), cls: `ne-wallet-badge ne-badge-${type}` })
}

function renderActive(container: HTMLElement, ctx: WizardContext): void {
  container.createEl('h4', { text: t('settings.activeAccounts') })
  const balances = accountBalances(ctx.ledger.snapshot).filter(b => b.account.active)
  if (balances.length === 0) {
    container.createEl('p', { text: t('settings.noActiveAccounts'), cls: 'ne-settings-empty' })
    return
  }
  const group = container.createDiv('ne-settings-group')
  for (const { account, balanceCents } of balances) renderActiveRow(group, ctx, account, balanceCents)
}

function renderActiveRow(group: HTMLElement, ctx: WizardContext, account: Account, balanceCents: number): void {
  const isDebt = account.accountType === 'creditCard'
  const row = group.createDiv('ne-wallet-row')
  const info = row.createDiv('ne-wallet-row-info')
  info.createSpan('ne-account-dot').style.background = account.color
  info.createSpan({ text: account.name, cls: 'ne-wallet-row-name' })
  badge(info, account.accountType)
  row.createSpan({
    text: (isDebt ? t('settings.creditDebtPrefix') : '') + formatCents(balanceCents),
    cls: `ne-wallet-row-balance${isDebt ? ' is-debt' : ''}`,
  })

  const actions = row.createDiv('ne-wallet-row-actions')
  actions.createEl('button', { text: t('ui.edit') }).addEventListener('click', () => editAccount(ctx, account))

  const hasRows = accountHasTransactions(ctx.ledger.snapshot, account.name)
  const remove = actions.createEl('button', { text: hasRows ? t('ui.archive') : t('ui.delete'), cls: 'mod-warning' })
  remove.addEventListener('click', () => removeAccount(ctx, account, hasRows))
}

function editAccount(ctx: WizardContext, account: Account): void {
  openAccountEdit(ctx.app, ctx.ledger, account, (action) => runAction(ctx, action))
}

function removeAccount(ctx: WizardContext, account: Account, hasRows: boolean): void {
  const allowed = canRemoveAccount(ctx.ledger.snapshot, account.name)
  if (!allowed.ok) { new Notice(t(allowed.reason)); return }
  const message = hasRows
    ? tn('wizard.confirm.archiveAccount', { name: account.name })
    : tn('wizard.confirm.deleteAccount', { name: account.name })
  new ConfirmModal(ctx.app, message, async () => {
    await runAction(ctx, () => (hasRows ? ctx.ledger.archiveAccount(account.name) : ctx.ledger.accounts.remove(account.name)))
  }).open()
}

function renderArchived(container: HTMLElement, ctx: WizardContext): void {
  const archived = ctx.ledger.snapshot.accounts.map(a => a.account).filter(a => !a.active)
  if (archived.length === 0) return
  container.createEl('h4', { text: t('settings.archivedAccounts') })
  const group = container.createDiv('ne-settings-group')

  for (const account of archived) {
    const row = group.createDiv('ne-wallet-row')
    const info = row.createDiv('ne-wallet-row-info')
    info.createSpan({ text: account.name, cls: 'ne-wallet-row-name' })
    badge(info, account.accountType)
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
      new ConfirmModal(ctx.app, t('confirm.unarchiveAccount'), async () => {
        await runAction(ctx, () => ctx.ledger.accounts.setActive(account.name, true))
      }).open()
    })
  }
}
