import { Events, ItemView, Notice, WorkspaceLeaf } from 'obsidian'
import { bucketsTotal, type Bucket } from '../domain/buckets'
import { todayString } from '../domain/dates'
import { formatCents } from '../domain/money'
import { isLiability } from '../domain/types'
import { t, tn } from '../labels'
import { AddAccountModal } from '../modal/AddAccountModal'
import { bucketRowModel } from '../modal/bucketState'
import { BucketsModal } from '../modal/BucketsModal'
import { openAccountEdit, openBalanceCorrection } from '../modal/editAccountFlow'
import { InvestingEntriesModal } from '../modal/InvestingEntriesModal'
import type { Ledger } from '../services/Ledger'
import { accountBalances, bucketsOf } from '../snapshot/queries'
import { loanScheduleText } from './accounts/loanScheduleText'
import { buildCard } from './panels'
import { drawPageHeader } from './PageHeader'

export const ACCOUNTS_VIEW_TYPE = 'nestegg-accounts'

export class AccountsView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private ledger: Ledger) {
    super(leaf)
  }

  getViewType() { return ACCOUNTS_VIEW_TYPE }
  getDisplayText() { return t('accounts.title') }
  getIcon() { return 'landmark' }

  onOpen(): Promise<void> {
    this.registerEvent((this.app.workspace as Events).on('nestegg:refresh', () => { this.render() }))
    this.render()
    return Promise.resolve()
  }

  onClose(): Promise<void> {
    this.contentEl.empty()
    return Promise.resolve()
  }

  private async run(action: () => Promise<void>, notice?: string): Promise<void> {
    await this.runChecked(action, notice)
  }

  // Same as `run`, telling the caller whether the action went through.
  private async runChecked(action: () => Promise<void>, notice?: string): Promise<boolean> {
    try {
      await action()
      if (notice) new Notice(notice)
      this.app.workspace.trigger('nestegg:refresh')
      return true
    } catch (e) {
      new Notice(tn('notice.actionFailed', { reason: e instanceof Error ? e.message : String(e) }))
      return false
    }
  }

  private renderBucketDetails(card: HTMLElement, buckets: Bucket[]) {
    const details = card.createEl('details', { cls: 'ne-bucket-details' })
    details.createEl('summary', { text: tn('buckets.showDetails', { count: String(buckets.length) }) })
    for (const bucket of buckets) {
      const model = bucketRowModel(bucket)
      const line = details.createDiv('ne-bucket-row')
      const head = line.createDiv('ne-bucket-head')
      head.createSpan({ text: model.name, cls: 'ne-wallet-row-name' })
      head.createSpan({ text: model.balanceText, cls: 'ne-wallet-row-balance' })
      if (model.percent === null || model.goalText === null) continue
      line.createDiv('ne-bucket-bar').createDiv('ne-bucket-bar-fill').style.width = `${model.percent}%`
      line.createDiv({ text: tn('buckets.progress', { percent: String(model.percent), goal: model.goalText }), cls: 'ne-wallet-row-desc' })
    }
  }

  render() {
    const { contentEl } = this
    const savedScroll = contentEl.scrollTop
    contentEl.empty()
    contentEl.addClass('ne-asset')
    drawPageHeader(contentEl, { owner: this, ledger: this.ledger, page: 'accounts', month: null })

    const card = buildCard(contentEl, { title: t('accounts.title') })
    const balances = accountBalances(this.ledger.snapshot).filter(b => b.account.active)
    if (balances.length === 0) {
      card.createEl('p', { text: t('settings.noActiveAccounts'), cls: 'ne-settings-empty' })
    }
    for (const { account, balanceCents } of balances) {
      const isDebt = isLiability(account.accountType)
      const entry = card.createDiv('ne-wallet-entry')
      const row = entry.createDiv('ne-wallet-row')
      const info = row.createDiv('ne-wallet-row-info')
      info.createSpan('ne-account-dot').style.background = account.color
      info.createSpan({ text: account.name, cls: 'ne-wallet-row-name' })
      info.createSpan({
        text: `${t(`label.accountType.${account.accountType}`)} · ` +
          tn('accounts.balanceAsOf', { date: account.enteredBalanceAsOf }),
        cls: 'ne-wallet-row-desc',
      })
      const schedule = loanScheduleText(account, todayString())
      if (schedule) info.createSpan({ text: schedule, cls: 'ne-wallet-row-desc' })
      const buckets = bucketsOf(this.ledger.snapshot, account.name)
      if (buckets.length > 0) {
        const available = balanceCents - bucketsTotal(buckets)
        info.createSpan({
          text: tn('accounts.available', { amount: formatCents(available) }),
          cls: `ne-wallet-row-desc${available < 0 ? ' ne-bucket-negative' : ''}`,
        })
      }
      if (account.unbalancedCents) {
        info.createSpan({
          text: tn('accounts.unbalanced', { diff: formatCents(Math.abs(account.unbalancedCents)) }),
          cls: 'ne-unbalanced-tag',
        })
      }
      row.createSpan({
        text: isDebt ? t('settings.creditDebtPrefix') + formatCents(-balanceCents) : formatCents(balanceCents),
        cls: `ne-wallet-row-balance${isDebt ? ' is-debt' : ''}`,
      })
      const actions = row.createDiv('ne-wallet-row-actions')
      if (account.accountType === 'cash') {
        actions.createEl('button', { text: t('buckets.button') })
          .addEventListener('click', () => new BucketsModal(this.app, this.ledger, account.name, (a) => this.runChecked(a)).open())
      }
      if (account.accountType === 'investing') {
        actions.createEl('button', { text: t('investing.entries') })
          .addEventListener('click', () => new InvestingEntriesModal(this.app, this.ledger, account.name, (a, n) => this.runChecked(a, n)).open())
      } else {
        actions.createEl('button', { text: t('accounts.correctBalance') })
          .addEventListener('click', () => openBalanceCorrection(this.app, this.ledger, account, (a) => this.run(a)))
      }
      actions.createEl('button', { text: t('ui.edit') })
        .addEventListener('click', () => openAccountEdit(this.app, this.ledger, account, (a) => this.run(a)))
      if (buckets.length > 0) this.renderBucketDetails(entry, buckets)
    }

    contentEl.createDiv('ne-accounts-add').createEl('button', { text: t('settings.addAccount'), cls: 'mod-cta' })
      .addEventListener('click', () => new AddAccountModal(this.app, this.ledger, (action, notice) => this.runChecked(action, notice)).open())
    contentEl.scrollTop = savedScroll
  }
}
