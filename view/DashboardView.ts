import { Events, ItemView, ViewStateResult, WorkspaceLeaf } from 'obsidian'
import type { Ledger } from '../services/Ledger'
import { groupByCategory, groupByTags, monthEntries, monthSummaries, netAssetTimeline, suggestedTags } from '../snapshot/queries'
import { DEFAULT_TAGS } from '../domain/defaults'
import type { CategoryIndex } from '../domain/categories'
import type { LedgerEntry } from '../domain/types'
import { renderMultiDropdown } from './detail/dropdown'
import { t, formatMonthLabel, formatYearMonth } from '../labels'
import { currentYearMonth } from '../utils'
import { renderCard } from './components'
import { metricText } from './budgetCards'
import { formatCents } from '../domain/money'
import type { TransactionType } from '../domain/types'
import { DETAIL_VIEW_TYPE } from './DetailView'
import { renderSharedHeader } from './SharedHeader'
import { Chart } from 'chart.js'
import { NESTEGG_ICON } from '../plugin/icon'
import { MonthData, drawIncExpChart, drawPie, getMonthRangeEndingAt } from './charts'

export const DASHBOARD_VIEW_TYPE = 'nestegg-dashboard'
const DASH_TAG_LIMIT = 10

export class DashboardView extends ItemView {
  private ledger: Ledger
  private currentYearMonth: string
  private charts: Chart[] = []
  private tagChart: Chart | null = null
  private selectedTags = new Set<string>(DEFAULT_TAGS)
  private tagPanel = { open: false }

  private clearCharts() {
    this.charts.forEach(c => c.destroy())
    this.charts = []
    this.tagChart = null
  }

  getState() {
    return { ...super.getState(), selectedTags: [...this.selectedTags] }
  }

  async setState(state: Record<string, unknown>, result: ViewStateResult) {
    const saved = state?.selectedTags
    if (Array.isArray(saved)) this.selectedTags = new Set(saved.filter((tag): tag is string => typeof tag === 'string').slice(0, DASH_TAG_LIMIT))
    await super.setState(state, result)
    if (this.contentEl.hasClass('ne-dashboard')) await this.render()
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

    // One panel: the month's balance as the headline, with income and expense as the two sides
    // of a bar that fills as spending approaches (and passes) income.
    const balanceVariant = monthBalance >= 0 ? 'positive' : 'negative'
    const hero = contentEl.createDiv(`ne-hero ${balanceVariant}`)
    hero.createDiv({ text: t('dash.balance'), cls: 'ne-hero-label' })
    hero.createDiv({ text: metricText(monthBalance, balanceVariant, true), cls: 'ne-hero-value' })
    const spentShare = monthIncome > 0 ? Math.min(100, (monthExpense / monthIncome) * 100) : monthExpense > 0 ? 100 : 0
    hero.createDiv('ne-hero-bar').createDiv('ne-hero-bar-fill').style.width = `${spentShare}%`
    const sides = hero.createDiv('ne-hero-sides')
    for (const [label, cents, variant] of [
      [t('dash.income'), monthIncome, 'income'],
      [t('dash.expense'), monthExpense, 'expense'],
    ] as const) {
      const side = sides.createDiv('ne-hero-side')
      side.createSpan({ cls: `ne-hero-dot ${variant}` })
      side.createSpan({ text: label, cls: 'ne-hero-side-label' })
      side.createSpan({ text: formatCents(cents), cls: 'ne-hero-side-value' })
    }

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

    const expCard = renderCard(gridRight, { title: t('dash.expenseByCategory') })
    if (expenseMap.size > 0) this.charts.push(drawPie(expCard, expenseMap, (cat: string) => { void this.openDetailWithFilter('expense', cat) }, 200))
    else expCard.createEl('p', { text: t('dash.noData'), cls: 'ne-no-data' })

    // ── Expense by chosen tags ───────────────────────────────────────────────
    const tagCard = renderCard(gridRight, { title: t('dash.expenseByTag') })
    renderMultiDropdown(tagCard, {
      label: t('dash.tags'), allLabel: t('dash.noTags'),
      options: suggestedTags(snapshot), selected: this.selectedTags, panelState: this.tagPanel,
      onChange: () => {
        // The set keeps insertion order, so the tag just added is the last one.
        while (this.selectedTags.size > DASH_TAG_LIMIT) this.selectedTags.delete([...this.selectedTags].pop()!)
        this.drawTagPie(tagPieEl, entries, index)
      },
      register: (cleanup) => this.register(cleanup),
    })
    const tagPieEl = tagCard.createDiv()
    this.drawTagPie(tagPieEl, entries, index)
  }

  // Redrawn alone when the tags change, so the tag box keeps focus.
  private drawTagPie(el: HTMLElement, entries: LedgerEntry[], index: CategoryIndex) {
    if (this.tagChart) {
      this.tagChart.destroy()
      this.charts = this.charts.filter(c => c !== this.tagChart)
      this.tagChart = null
    }
    el.empty()
    const totals = groupByTags(entries, index, [...this.selectedTags])
    if (totals.size === 0) {
      el.createEl('p', { text: t('dash.noData'), cls: 'ne-no-data' })
      return
    }
    this.tagChart = drawPie(el, totals, undefined, 200)
    this.charts.push(this.tagChart)
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
