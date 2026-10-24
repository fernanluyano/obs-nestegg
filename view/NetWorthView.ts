import { Events, ItemView, Notice, WorkspaceLeaf } from 'obsidian'
import type { Ledger } from '../services/Ledger'
import { activeAssets } from '../snapshot/assetQueries'
import type { AssetRecord } from '../snapshot/snapshot'
import {
  assetsBreakdown, cashOnHandTimeline, cashStartMonth, creditCardDebts, investingTotal, loanDebts, netWorthStartMonth, netWorthTimeline,
} from '../snapshot/queries'
import { cagr, formatChange, formatPercent, growthPoints, yearToDateRatio } from '../domain/growth'
import { thisMonth } from '../helpers'
import { t, tn, monthName, monthWithYear, type LabelKey } from '../labels'
import { latestValuation } from '../domain/assets'
import { INVESTING_CARD_COLOR } from '../domain/colors'
import { todayString } from '../domain/dates'
import { payoffCharts, type LoanDebt } from '../domain/loans'
import { centsToDecimal, formatCents, parseCents } from '../domain/money'
import { AddAssetModal } from '../modal/AddAssetModal'
import { AddValuationModal } from '../modal/AddValuationModal'
import { ConfirmDialog } from '../modal/ConfirmDialog'
import { EditAssetModal } from '../modal/EditAssetModal'
import { drawPageHeader } from './PageHeader'
import { Chart } from 'chart.js'
import { drawCashLine, drawNetWorthLines, drawPayoffAreas, drawPieWithLegend, recentMonths, netWorthPalette } from './plots'
import { NESTEGG_ICON } from '../plugin/icon'
import { buildMetricTile, buildCard } from './panels'
import { creditCardRows, debtCard, debtTotals } from './debtRows'

export const NETWORTH_VIEW_TYPE = 'nestegg-networth'

export class NetWorthView extends ItemView {
  private ledger: Ledger
  private charts: Chart[] = []

  private clearCharts() {
    this.charts.forEach(c => c.destroy())
    this.charts = []
  }

  constructor(leaf: WorkspaceLeaf, ledger: Ledger) {
    super(leaf)
    this.ledger = ledger
  }

  getViewType() { return NETWORTH_VIEW_TYPE }
  getDisplayText() { return t('networth.title') }
  getIcon() { return NESTEGG_ICON }

  async onOpen() {
    this.registerEvent(
      (this.app.workspace as Events).on('nestegg:refresh', () => { void this.render() })
    )
    this.registerEvent(
      (this.app.workspace as Events).on('css-change', () => { void this.render() })
    )
    await this.render()
  }

  onClose(): Promise<void> {
    this.clearCharts()
    this.contentEl.empty()
    return Promise.resolve()
  }

  // Same as the Accounts tab: runs the change, refreshes the views, and tells the caller whether it went through.
  private async run(action: () => Promise<void>, notice?: string): Promise<boolean> {
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

  // Months from the first data we have to now; at least two, so a line has something to draw.
  private monthsOfHistory(start: string | null): number {
    if (!start) return 2
    const [sy, sm] = start.split('-').map(Number)
    const [cy, cm] = thisMonth().split('-').map(Number)
    return Math.max((cy - sy) * 12 + (cm - sm) + 1, 2)
  }

  private renderNetWorth(contentEl: HTMLElement) {
    contentEl.createEl('h2', { text: t('networth.title'), cls: 'ne-section-title' })
    const start = netWorthStartMonth(this.ledger.snapshot)
    const shown = this.monthsOfHistory(start)
    // A year of lead-in months, so the first month shown still has a previous month and a year ago.
    const months = recentMonths(shown + 12)
    const timeline = netWorthTimeline(this.ledger.snapshot, months)
    const values = months.map(ym => timeline.get(ym)?.netCents ?? 0)
    const firstData = Math.max(0, start ? months.indexOf(start) : 0)
    const points = growthPoints(months, values, 12, firstData).map(growth => ({
      monthLabel: monthName(growth.month),
      tooltipLabel: monthWithYear(growth.month, 'short'),
      assetsCents: timeline.get(growth.month)?.assetsCents ?? 0,
      liabilitiesCents: timeline.get(growth.month)?.liabilitiesCents ?? 0,
      netCents: growth.cents,
      changeCents: growth.changeCents,
      changeRatio: growth.changeRatio,
      yoyRatio: growth.yoyRatio,
    }))
    const now = points[points.length - 1]
    const [cy, cm] = thisMonth().split('-').map(Number)
    const [sy, sm] = (start ?? thisMonth()).split('-').map(Number)
    const rate = cagr(values[firstData], values[values.length - 1], (cy - sy) * 12 + (cm - sm))

    const byType = new Map([...assetsBreakdown(this.ledger.snapshot)].map(([key, cents]) => [t(key as LabelKey), cents]))
    const wrap = contentEl.createDiv('ne-assets-charts' + (byType.size > 0 ? '' : ' is-single'))
    const card = buildCard(wrap)
    const header = card.createDiv('ne-card-header-row')
    header.createEl('div', { text: t('networth.title'), cls: 'ne-card-title' })

    const colors = netWorthPalette()
    const legend = card.createDiv('ne-networth-legend')
    for (const [label, cents, color] of [
      [t('networth.assets'), now.assetsCents, colors.assets],
      [t('networth.liabilities'), now.liabilitiesCents, colors.liabilities],
      [t('networth.net'), now.netCents, colors.net],
    ] as const) {
      const item = legend.createDiv('ne-networth-legend-item')
      item.createSpan('ne-account-dot').style.background = color
      item.createSpan({ text: label, cls: 'ne-networth-legend-label' })
      item.createSpan({ text: formatCents(cents), cls: 'ne-networth-legend-value' })
    }

    const growth = card.createDiv('ne-networth-legend')
    for (const [label, value] of [
      [t('cash.monthOverMonth'), formatChange(now.changeCents, now.changeRatio)],
      [t('cash.yearToDate'), formatPercent(yearToDateRatio(months, values, firstData))],
      [t('cash.yearOverYear'), formatPercent(now.yoyRatio)],
      [t('cash.cagr'), formatPercent(rate)],
    ] as const) {
      const item = growth.createDiv('ne-networth-legend-item')
      item.createSpan({ text: label, cls: 'ne-networth-legend-label' })
      item.createSpan({ text: value, cls: 'ne-networth-legend-value' })
    }

    this.charts.push(drawNetWorthLines(card.createDiv('ne-chart-wrap'), points))

    if (byType.size > 0) {
      this.charts.push(drawPieWithLegend(buildCard(wrap, { title: t('assets.byType') }), byType, undefined, 150))
    }
  }

  private renderAssetCard(parent: HTMLElement, { asset, valuations }: AssetRecord) {
    const card = parent.createDiv('ne-debt-card')
    const header = card.createDiv('ne-debt-card-header')
    header.createSpan('ne-account-dot').style.background = asset.color
    header.createSpan({ text: asset.name, cls: 'ne-debt-card-name' })
    header.createSpan({ text: t(`label.assetType.${asset.assetType}`), cls: 'ne-debt-card-kind' })

    const latest = latestValuation(valuations)
    const stat = card.createDiv('ne-debt-card-stat')
    stat.createSpan({ text: t('assets.currentValue') })
    stat.createSpan({ text: formatCents(latest?.valueCents ?? 0), cls: 'ne-debt-card-value' })
    if (latest) card.createDiv({ text: tn('assets.valueAsOf', { date: latest.date }), cls: 'ne-debt-card-hint' })
    if (latest?.note) card.createDiv({ text: latest.note, cls: 'ne-asset-note' })

    const actions = card.createDiv('ne-asset-card-actions')
    actions.createEl('button', { text: t('assets.addValuation') })
      .addEventListener('click', () => new AddValuationModal(this.app, this.ledger, asset.name, (a, n) => this.run(a, n)).open())
    actions.createEl('button', { text: t('ui.edit') })
      .addEventListener('click', () => new EditAssetModal(this.app, this.ledger, asset.name, (a, n) => this.run(a, n)).open())
    actions.createEl('button', { text: t('ui.archive'), cls: 'mod-warning' })
      .addEventListener('click', () => {
        new ConfirmDialog(this.app, tn('assets.confirmArchive', { name: asset.name }), () => {
          void this.run(() => this.ledger.assets.archive(asset.name), tn('notice.assetArchived', { name: asset.name }))
        }).open()
      })
  }

  // Cash on hand with how it moved: against the previous month, against a year ago, and the compound
  // annual rate since the first data. Both charts cover all history.
  private renderCash(contentEl: HTMLElement) {
    const { snapshot } = this.ledger
    const start = cashStartMonth(snapshot)
    if (!start) return

    const shown = this.monthsOfHistory(start)
    // A year of lead-in months, so the first month shown still has a previous month and a year ago.
    const months = recentMonths(shown + 12)
    const timeline = cashOnHandTimeline(snapshot, months)
    const values = months.map(ym => timeline.get(ym) ?? 0)
    const points = growthPoints(months, values, 12, months.indexOf(start)).map(point => ({
      ...point,
      monthLabel: monthName(point.month),
      tooltipLabel: monthWithYear(point.month, 'short'),
    }))
    const now = points[points.length - 1]

    const [sy, sm] = start.split('-').map(Number)
    const [cy, cm] = thisMonth().split('-').map(Number)
    const spanMonths = (cy - sy) * 12 + (cm - sm)
    const edges = cashOnHandTimeline(snapshot, [start, thisMonth()])
    const rate = cagr(edges.get(start) ?? 0, edges.get(thisMonth()) ?? 0, spanMonths)

    const card = buildCard(contentEl.createDiv('ne-assets-charts is-single'))
    const header = card.createDiv('ne-card-header-row')
    header.createEl('div', { text: t('cash.title'), cls: 'ne-card-title' })

    const change = formatChange(now.changeCents, now.changeRatio)
    const stats = card.createDiv('ne-networth-legend')
    for (const [label, value] of [
      [t('cash.title'), formatCents(now.cents)],
      [t('cash.monthOverMonth'), change],
      [t('cash.yearToDate'), formatPercent(yearToDateRatio(months, values, months.indexOf(start)))],
      [t('cash.yearOverYear'), formatPercent(now.yoyRatio)],
      [t('cash.cagr'), formatPercent(rate)],
    ] as const) {
      const item = stats.createDiv('ne-networth-legend-item')
      item.createSpan({ text: label, cls: 'ne-networth-legend-label' })
      item.createSpan({ text: value, cls: 'ne-networth-legend-value' })
    }

    this.charts.push(drawCashLine(card.createDiv('ne-chart-wrap'), points))
  }

  private renderAssets(contentEl: HTMLElement) {
    contentEl.createEl('h2', { text: t('asset.title'), cls: 'ne-section-title' })
    this.renderCash(contentEl)
    const { snapshot } = this.ledger
    const addButton = (parent: HTMLElement) => parent.createDiv('ne-accounts-add').createEl('button', { text: t('assets.add'), cls: 'mod-cta' })
      .addEventListener('click', () => new AddAssetModal(this.app, this.ledger, (a, n) => this.run(a, n)).open())

    const assets = activeAssets(this.ledger.snapshot)
    const investing = investingTotal(snapshot)
    if (assets.length === 0 && !investing) {
      const empty = buildCard(contentEl, { title: t('asset.title') })
      empty.createEl('p', { text: t('assets.empty'), cls: 'ne-settings-empty' })
      addButton(empty)
      return
    }

    const cards = contentEl.createDiv('ne-debt-cards')
    // One card for every investing account together, not one per account.
    if (investing) {
      const card = cards.createDiv('ne-debt-card')
      const header = card.createDiv('ne-debt-card-header')
      header.createSpan('ne-account-dot').style.background = INVESTING_CARD_COLOR
      header.createSpan({ text: t('investing.title'), cls: 'ne-debt-card-name' })
      header.createSpan({ text: tn('investing.accountCount', { count: String(investing.count) }), cls: 'ne-debt-card-kind' })
      const stat = card.createDiv('ne-debt-card-stat')
      stat.createSpan({ text: t('assets.currentValue') })
      stat.createSpan({ text: formatCents(investing.cents), cls: 'ne-debt-card-value' })
    }
    for (const record of assets) this.renderAssetCard(cards, record)
    addButton(contentEl)
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

  private renderLiabilities(contentEl: HTMLElement) {
    contentEl.createEl('h2', { text: t('debt.title'), cls: 'ne-section-title' })
    const today = todayString()
    const loans = loanDebts(this.ledger.snapshot, today)
    const creditCards = creditCardDebts(this.ledger.snapshot)
    if (loans.length === 0 && creditCards.length === 0) {
      buildCard(contentEl, { title: t('debt.title') }).createEl('p', { text: t('debt.empty'), cls: 'ne-settings-empty' })
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
    const total = buildMetricTile(metrics, t('debt.totalDebt'), totals.owedCents, 'expense', { signed: false, hero: true })
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
      const tile = buildCard(chartsWrap, {
        title: tn('debt.payoffTimeline', { kind: t(`label.loanKind.${chart.kind}`) }),
      })
      this.charts.push(drawPayoffAreas(tile.createDiv('ne-chart-wrap ne-debt-chart'), chart))
    }
  }

  async render() {
    const { contentEl } = this
    this.clearCharts()
    const savedScroll = contentEl.scrollTop
    contentEl.empty()
    contentEl.addClass('ne-asset')

    drawPageHeader(contentEl, {
      owner: this,
      ledger: this.ledger,
      page: 'networth',
      month: null,
    })

    this.renderNetWorth(contentEl)
    this.renderAssets(contentEl)
    this.renderLiabilities(contentEl)
    contentEl.scrollTop = savedScroll
  }
}
