import { Events, ItemView, WorkspaceLeaf } from 'obsidian'
import type { Ledger } from '../services/Ledger'
import { groupByCategory, monthEntries, monthSummaries, netAssetTimeline } from '../snapshot/queries'
import { t, formatMonthLabel, formatYearMonth } from '../labels'
import { currentYearMonth } from '../utils'
import { createMetric, renderCard } from './components'
import type { TransactionType } from '../domain/types'
import { DETAIL_VIEW_TYPE } from './DetailView'
import { renderSharedHeader } from './SharedHeader'
import { Chart } from 'chart.js'
import { NESTEGG_ICON } from '../plugin/icon'
import { MonthData, drawIncExpChart, drawPie, getMonthRangeEndingAt } from './charts'

export const DASHBOARD_VIEW_TYPE = 'nestegg-dashboard'

export class DashboardView extends ItemView {
  private ledger: Ledger
  private currentYearMonth: string
  private charts: Chart[] = []

  private clearCharts() {
    this.charts.forEach(c => c.destroy())
    this.charts = []
  }

  constructor(leaf: WorkspaceLeaf, ledger: Ledger) {
    super(leaf)
    this.ledger = ledger
    this.currentYearMonth = currentYearMonth()
  }

  getViewType() { return DASHBOARD_VIEW_TYPE }
  getDisplayText() { return t('dashboard.title') }
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

  async render() {
    const { contentEl } = this
    this.clearCharts()
    contentEl.empty()
    contentEl.addClass('ne-dashboard')

    const months = getMonthRangeEndingAt(this.currentYearMonth, 6)

    const { snapshot } = this.ledger
    const { index } = this.ledger.store
    const entries = monthEntries(snapshot, this.currentYearMonth)
    const summaries = monthSummaries(snapshot, months)
    const netTimeline = netAssetTimeline(snapshot, months)

    renderSharedHeader(contentEl, {
      view: this,
      ledger: this.ledger,
      activeView: 'dashboard',
      yearMonth: this.currentYearMonth,
      onMonthChange: (ym) => { this.currentYearMonth = ym; void this.render() },
    })

    // ── Monthly metrics ──────────────────────────────────────────────────────
    const { incomeCents: monthIncome, expenseCents: monthExpense } = summaries.get(this.currentYearMonth)!
    const monthBalance = monthIncome - monthExpense

    const metricsEl = contentEl.createDiv('ne-metrics')
    createMetric(metricsEl, t('dash.income'),  monthIncome,  'income')
    createMetric(metricsEl, t('dash.expense'), monthExpense, 'expense')
    createMetric(metricsEl, t('dash.balance'), monthBalance,
      monthBalance >= 0 ? 'positive' : 'negative',
      { hero: true },
    )

    // ── 6-month bar chart ────────────────────────────────────────────────────
    const data: MonthData[] = months.map(ym => ({
      monthLabel: formatMonthLabel(ym),
      tooltipLabel: formatYearMonth(ym, 'short'),
      income: summaries.get(ym)?.incomeCents ?? 0,
      expense: summaries.get(ym)?.expenseCents ?? 0,
      net: netTimeline.get(ym) ?? null,
    }))

    // ── 2-column grid: bar chart left, pie charts right ─────────────────────
    const grid2 = contentEl.createDiv('ne-grid-2')

    const incExpCard = renderCard(grid2, {
      title: t('trend.monthlyIncomeExpense'),
      className: 'ne-inc-exp-card',
    })
    const incExpChartWrap = incExpCard.createDiv('ne-chart-wrap')
    this.charts.push(drawIncExpChart(incExpChartWrap, data))

    // ── Category pies ────────────────────────────────────────────────────────
    const gridRight = grid2.createDiv('ne-grid-right')

    const expenseMap = groupByCategory(entries, index, 'expense')
    const incomeMap  = groupByCategory(entries, index, 'income')

    const expCard = renderCard(gridRight, { title: t('dash.expenseByCategory') })
    if (expenseMap.size > 0) this.charts.push(drawPie(expCard, expenseMap, (cat: string) => { void this.openDetailWithFilter('expense', cat) }, 200))
    else expCard.createEl('p', { text: t('dash.noData'), cls: 'ne-no-data' })

    const incCard = renderCard(gridRight, { title: t('dash.incomeByCategory') })
    if (incomeMap.size > 0) this.charts.push(drawPie(incCard, incomeMap, (cat: string) => { void this.openDetailWithFilter('income', cat) }, 200))
    else incCard.createEl('p', { text: t('dash.noData'), cls: 'ne-no-data' })
  }

  private async openDetailWithFilter(type: TransactionType, category: string) {
    await this.openOrRevealView(DETAIL_VIEW_TYPE, {
      state: { yearMonth: this.currentYearMonth, filterType: type, filterCategory: category, resetFilters: true },
    })
  }

  private async openOrRevealView(type: string, options?: { state?: Record<string, unknown> }) {
    const existing = this.app.workspace.getLeavesOfType(type)
    const leaf = existing[0] ?? this.app.workspace.getLeaf('tab')

    await leaf.setViewState({
      type,
      active: true,
      state: options?.state,
    })

    void this.app.workspace.revealLeaf(leaf)
  }
}
