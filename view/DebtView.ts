import { Events, ItemView, Notice, WorkspaceLeaf } from 'obsidian'
import type { Chart } from 'chart.js'
import { todayString } from '../domain/dates'
import { payoffCharts, type LoanDebt } from '../domain/loans'
import { centsToDecimal, parseCents } from '../domain/money'
import { NESTEGG_ICON } from '../plugin/icon'
import { t, tn } from '../labels'
import type { Ledger } from '../services/Ledger'
import { loanDebts } from '../snapshot/queries'
import { drawPayoffChart } from './charts'
import { createMetric, renderCard } from './components'
import { debtCard, debtTotals } from './debtRows'
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
    if (loans.length === 0) {
      renderCard(contentEl, { title: t('debt.title') }).createEl('p', { text: t('debt.empty'), cls: 'ne-settings-empty' })
      contentEl.scrollTop = savedScroll
      return
    }

    const totals = debtTotals(loans)
    const metrics = contentEl.createDiv('ne-metrics')
    createMetric(metrics, t('debt.totalDebt'), totals.owedCents, 'expense', { signed: false })
    const count = metrics.createDiv('ne-metric')
    count.createDiv({ text: t('debt.loans'), cls: 'ne-metric-label' })
    count.createDiv({ text: String(totals.loans), cls: 'ne-metric-value' })

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
