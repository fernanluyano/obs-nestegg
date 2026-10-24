import { Events, ItemView, ViewStateResult, WorkspaceLeaf } from 'obsidian'
import type { Ledger } from '../services/Ledger'
import { groupByCategory, groupByTags, monthEntries, monthSummaries, netAssetTimeline, suggestedTags } from '../snapshot/queries'
import { DEFAULT_TAGS } from '../domain/defaults'
import type { CategoryIndex } from '../domain/categories'
import type { LedgerEntry, TransactionType } from '../domain/types'
import { renderMultiDropdown } from './detail/dropdown'
import { t, monthName, monthWithYear } from '../labels'
import { thisMonth } from '../helpers'
import { buildCard } from './panels'
import { TRANSACTIONS_VIEW_TYPE } from './TransactionsView'
import { drawPageHeader } from './PageHeader'
import { openOrRevealView } from './openView'
import { Chart } from 'chart.js'
import { NESTEGG_ICON } from '../plugin/icon'
import { drawCashFlowBars, drawPieWithLegend, monthsEndingAt, type IncomeExpenseMonth } from './plots'

// The string is saved in users' workspaces, so it keeps its original value.
export const OVERVIEW_VIEW_TYPE = 'nestegg-dashboard'

const MAX_CHOSEN_TAGS = 10
const TREND_MONTHS = 6
const PIE_SIZE = 200

export class OverviewView extends ItemView {
  private shownMonth = thisMonth()
  private charts: Chart[] = []
  private tagChart: Chart | null = null
  private chosenTags = new Set<string>(DEFAULT_TAGS)
  private tagPanel = { open: false }

  constructor(leaf: WorkspaceLeaf, private ledger: Ledger) {
    super(leaf)
  }

  getViewType() { return OVERVIEW_VIEW_TYPE }
  getDisplayText() { return t('dashboard.title') }
  getIcon() { return NESTEGG_ICON }

  getState() {
    return { ...super.getState(), selectedTags: [...this.chosenTags] }
  }

  async setState(state: Record<string, unknown>, result: ViewStateResult) {
    const saved = state?.selectedTags
    if (Array.isArray(saved)) {
      const tags = saved.filter((tag): tag is string => typeof tag === 'string')
      this.chosenTags = new Set(tags.slice(0, MAX_CHOSEN_TAGS))
    }
    await super.setState(state, result)
    if (this.contentEl.hasClass('ne-dashboard')) await this.render()
  }

  async onOpen() {
    const workspace = this.app.workspace as Events
    this.registerEvent(workspace.on('nestegg:refresh', () => { void this.render() }))
    this.registerEvent(workspace.on('css-change', () => { void this.render() }))
    await this.render()
  }

  onClose(): Promise<void> {
    this.destroyCharts()
    this.contentEl.empty()
    return Promise.resolve()
  }

  private destroyCharts() {
    this.charts.forEach(chart => chart.destroy())
    this.charts = []
    this.tagChart = null
  }

  async render() {
    const { contentEl } = this
    this.destroyCharts()
    contentEl.empty()
    contentEl.addClass('ne-dashboard')

    const months = monthsEndingAt(this.shownMonth, TREND_MONTHS)

    const { snapshot } = this.ledger
    const { index } = this.ledger.store
    const entries = monthEntries(snapshot, this.shownMonth)
    const summaries = monthSummaries(snapshot, months)
    const netTimeline = netAssetTimeline(snapshot, months)

    drawPageHeader(contentEl, {
      owner: this,
      ledger: this.ledger,
      page: 'dashboard',
      month: this.shownMonth,
      onMonth: (month) => { this.shownMonth = month; void this.render() },
    })

    const trend: IncomeExpenseMonth[] = months.map(month => ({
      monthLabel: monthName(month),
      tooltipLabel: monthWithYear(month, 'short'),
      income: summaries.get(month)?.incomeCents ?? 0,
      expense: summaries.get(month)?.expenseCents ?? 0,
      net: netTimeline.get(month) ?? null,
    }))

    // Two columns: the income/expense bars on the left, the pies on the right.
    const columns = contentEl.createDiv('ne-grid-2')

    const barsCard = buildCard(columns, {
      title: t('trend.monthlyIncomeExpense'),
      className: 'ne-inc-exp-card',
    })
    this.charts.push(drawCashFlowBars(barsCard.createDiv('ne-chart-wrap'), trend))

    const pies = columns.createDiv('ne-grid-right')

    const byCategory = groupByCategory(entries, index, 'expense')
    const categoryCard = buildCard(pies, { title: t('dash.expenseByCategory') })
    if (byCategory.size > 0) {
      const openCategory = (category: string) => { void this.openDetailFiltered('expense', category) }
      this.charts.push(drawPieWithLegend(categoryCard, byCategory, openCategory, PIE_SIZE))
    } else {
      categoryCard.createEl('p', { text: t('dash.noData'), cls: 'ne-no-data' })
    }

    const tagCard = buildCard(pies, { title: t('dash.expenseByTag') })
    renderMultiDropdown(tagCard, {
      label: t('dash.tags'), allLabel: t('dash.noTags'),
      options: suggestedTags(snapshot), selected: this.chosenTags, panelState: this.tagPanel,
      onChange: () => {
        // A set keeps insertion order, so the tag just added is the last one.
        while (this.chosenTags.size > MAX_CHOSEN_TAGS) this.chosenTags.delete([...this.chosenTags].pop()!)
        this.drawTagPie(tagPie, entries, index)
      },
      register: (cleanup) => this.register(cleanup),
    })
    const tagPie = tagCard.createDiv()
    this.drawTagPie(tagPie, entries, index)
  }

  // Redrawn on its own when the tags change, so the tag box keeps focus.
  private drawTagPie(holder: HTMLElement, entries: LedgerEntry[], index: CategoryIndex) {
    if (this.tagChart) {
      this.tagChart.destroy()
      this.charts = this.charts.filter(chart => chart !== this.tagChart)
      this.tagChart = null
    }
    holder.empty()
    const totals = groupByTags(entries, index, [...this.chosenTags])
    if (totals.size === 0) {
      holder.createEl('p', { text: t('dash.noData'), cls: 'ne-no-data' })
      return
    }
    this.tagChart = drawPieWithLegend(holder, totals, undefined, PIE_SIZE)
    this.charts.push(this.tagChart)
  }

  private async openDetailFiltered(type: TransactionType, category: string) {
    await openOrRevealView(this.app, TRANSACTIONS_VIEW_TYPE, {
      yearMonth: this.shownMonth, filterType: type, filterCategory: category, resetFilters: true,
    })
  }
}
