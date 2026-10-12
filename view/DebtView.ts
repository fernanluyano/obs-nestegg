import { Events, ItemView, Notice, WorkspaceLeaf } from 'obsidian'
import type { Chart } from 'chart.js'
import { todayString } from '../domain/dates'
import { payoffCharts, type LoanDebt } from '../domain/loans'
import { centsToDecimal, formatCents, parseCents } from '../domain/money'
import { NESTEGG_ICON } from '../plugin/icon'
import { t, tn } from '../labels'
import type { Ledger } from '../services/Ledger'
import { creditCardDebts, loanDebts } from '../snapshot/queries'
import { drawPayoffChart } from './charts'
import { createMetric, renderCard } from './components'
import { creditCardRows, debtCard, debtTotals } from './debtRows'
import { renderSharedHeader } from './SharedHeader'

export const DEBT_VIEW_TYPE = 'nestegg-debt'

export class DebtView extends ItemView {
  private charts: Chart[] = []

  constructor(leaf: WorkspaceLeaf, private ledger: Ledger) {
    super(leaf)
  }

  getViewType() { return DEBT_VIEW_TYPE }
  getDisplayText() { return t('debt.title') }
  getIcon() { return NESTEGG_ICON }

  onOpen(): Promise<void> {
    const events = this.app.workspace as Events
    this.registerEvent(events.on('nestegg:refresh', () => { this.render() }))
    this.registerEvent(events.on('css-change', () => { this.render() }))
    this.render()
    return Promise.resolve()
  }

  onClose(): Promise<void> {
    this.clearCharts()
    this.contentEl.empty()
    return Promise.resolve()
  }

  private clearCharts() {
    this.charts.forEach(c => c.destroy())
    this.charts = []
  }

  private renderExtraInput(card: HTMLElement, loan: LoanDebt) {
    const row = card.createDiv('ne-debt-card-extra')
    row.createSpan({ text: t('debt.extraPayment') })
    const current = loan.account.extraPaymentCents ?? 0
    const input = row.createEl('input', { type: 'text', cls: 'ne-add-wallet-input ne-debt-card-extra-input' })
    input.inputMode = 'decimal'
    input.value = centsToDecimal(current)
    input.addEventListener('change', () => {
      const cents = parseCents(input.value)
      if (cents === null || cents < 0) {
        new Notice(t('debt.extraInvalid'))
        input.value = centsToDecimal(current)
        return
      }
      if (cents === current) return
      this.ledger.accounts.update(loan.account.name, { extraPaymentCents: cents > 0 ? cents : undefined })
        .then(() => { this.app.workspace.trigger('nestegg:refresh') })
        .catch((e: unknown) => { new Notice(e instanceof Error ? e.message : String(e)) })
    })
  }

  render() {
    const { contentEl } = this
    this.clearCharts()
    const savedScroll = contentEl.scrollTop
    contentEl.empty()
    contentEl.addClass('ne-asset')
    renderSharedHeader(contentEl, { view: this, ledger: this.ledger, activeView: 'debt', yearMonth: null })

    const today = todayString()
    const loans = loanDebts(this.ledger.snapshot, today)
    const creditCards = creditCardDebts(this.ledger.snapshot)
    if (loans.length === 0 && creditCards.length === 0) {
      renderCard(contentEl, { title: t('debt.title') }).createEl('p', { text: t('debt.empty'), cls: 'ne-settings-empty' })
      contentEl.scrollTop = savedScroll
      return
    }

    const totals = debtTotals(loans, creditCards)
    const metrics = contentEl.createDiv('ne-metrics ne-metrics--debt')
    const statLine = (parent: HTMLElement, label: string, value: string) => {
      const row = parent.createDiv('ne-debt-card-stat')
      row.createSpan({ text: label })
      row.createSpan({ text: value, cls: 'ne-debt-card-value' })
    }
    // One summary card: the overall debt, then what part of it is cards and what part is loans.
    const total = createMetric(metrics, t('debt.totalDebt'), totals.owedCents, 'expense', { signed: false, hero: true })
    statLine(total, t('debt.creditCards'), formatCents(totals.cardsCents))
    statLine(total, t('debt.loans'), formatCents(totals.loansCents))

    const cards = contentEl.createDiv('ne-debt-cards')
    for (const loan of loans) {
      const card = cards.createDiv('ne-debt-card')
      const header = card.createDiv('ne-debt-card-header')
      header.createSpan('ne-account-dot').style.background = loan.account.color
      header.createSpan({ text: loan.account.name, cls: 'ne-debt-card-name' })
      header.createSpan({ text: t(`label.loanKind.${loan.account.loanKind!}`), cls: 'ne-debt-card-kind' })
      const { stats, hints } = debtCard(loan, today)
      for (const stat of stats) {
        const row = card.createDiv('ne-debt-card-stat')
        row.createSpan({ text: stat.label })
        row.createSpan({ text: stat.value, cls: 'ne-debt-card-value' })
      }
      for (const hint of hints) card.createDiv({ text: hint, cls: 'ne-debt-card-hint' })
      if (loan.projection) this.renderExtraInput(card, loan)
    }
    // One read only card for all the credit cards, a line each: a card has no plan to edit, and it is paid with a transfer.
    if (creditCards.length > 0) {
      const card = cards.createDiv('ne-debt-card')
      card.createDiv('ne-debt-card-header').createSpan({ text: t('debt.creditCards'), cls: 'ne-debt-card-name' })
      for (const { name, color, owedText } of creditCardRows(creditCards)) {
        const row = card.createDiv('ne-debt-card-stat')
        const label = row.createSpan('ne-debt-card-line')
        label.createSpan('ne-account-dot').style.background = color
        label.createSpan({ text: name })
        row.createSpan({ text: owedText, cls: 'ne-debt-card-value' })
      }
    }

    const chartsWrap = contentEl.createDiv('ne-debt-charts')
    for (const chart of payoffCharts(loans, today)) {
      const tile = renderCard(chartsWrap, {
        title: tn('debt.payoffTimeline', { kind: t(`label.loanKind.${chart.kind}`) }),
      })
      this.charts.push(drawPayoffChart(tile.createDiv('ne-chart-wrap ne-debt-chart'), chart))
    }
    contentEl.scrollTop = savedScroll
  }
}
