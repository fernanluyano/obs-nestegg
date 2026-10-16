import { Events, ItemView, Notice, ViewStateResult, WorkspaceLeaf, setIcon } from 'obsidian'
import { categoryTotals, parsePlanned, sectionsByCategory, type BudgetProgress, type BudgetSection } from '../domain/budget'
import { centsToDecimal, formatCents } from '../domain/money'
import { t, tn } from '../labels'
import type { Ledger } from '../services/Ledger'
import { budgetSheetOf, findBudget } from '../snapshot/budgetQueries'
import { currentYearMonth } from '../utils'
import { barWidth, leftText } from './budgetRow'
import { budgetCards } from './budgetCards'
import { NESTEGG_ICON } from '../plugin/icon'
import { createMetric, renderCard } from './components'
import { renderSharedHeader } from './SharedHeader'

export const BUDGET_VIEW_TYPE = 'nestegg-budget'

export class BudgetView extends ItemView {
  private yearMonth = currentYearMonth()
  private collapsed = new Set<string>()

  constructor(leaf: WorkspaceLeaf, private ledger: Ledger) {
    super(leaf)
  }

  getViewType() { return BUDGET_VIEW_TYPE }
  getDisplayText() { return t('budget.title') }
  getIcon() { return NESTEGG_ICON }

  async setState(state: Record<string, unknown>, result: ViewStateResult) {
    if (state?.yearMonth) this.yearMonth = state.yearMonth as string
    await super.setState(state, result)
    await this.render()
  }

  async onOpen() {
    this.registerEvent((this.app.workspace as Events).on('nestegg:refresh', () => { void this.render() }))
    await this.render()
  }

  onClose(): Promise<void> {
    this.contentEl.empty()
    return Promise.resolve()
  }

  async render() {
    const { contentEl } = this
    const savedScroll = contentEl.scrollTop
    contentEl.empty()
    contentEl.addClass('ne-budget')

    renderSharedHeader(contentEl, {
      view: this,
      ledger: this.ledger,
      activeView: 'budget',
      yearMonth: this.yearMonth,
      onMonthChange: (ym) => { this.yearMonth = ym; void this.render() },
    })

    if (!findBudget(this.ledger.snapshot, this.yearMonth)) {
      this.renderEmpty(contentEl)
    } else {
      this.renderSheet(contentEl)
    }
    contentEl.scrollTop = savedScroll
  }

  private renderEmpty(parent: HTMLElement) {
    const card = renderCard(parent, { className: 'ne-budget-empty' })
    card.createEl('p', { text: tn('budget.empty', { month: this.yearMonth }) })
    card.createEl('p', { text: t('budget.emptyHint'), cls: 'ne-budget-muted' })
    card.createEl('button', { text: t('budget.create'), cls: 'mod-cta' })
      .addEventListener('click', () => { void this.run(() => this.ledger.budgets.create(this.yearMonth)) })
  }

  private renderSheet(parent: HTMLElement) {
    const { income, expense, payments, summary } = budgetSheetOf(this.ledger.snapshot, this.yearMonth)

    const metrics = parent.createDiv('ne-metrics')
    for (const c of budgetCards(summary)) {
      createMetric(metrics, c.label, c.valueCents, c.variant, { compact: true, signed: c.signed, hero: c.hero, hint: c.hint })
    }

    for (const group of sectionsByCategory([...income, ...expense, ...payments])) this.renderCategory(parent, group)
  }

  // One card per category. Its header totals the expense and debt payment rows together; a category
  // that also holds income rows lists them under their own heading, outside that total.
  private renderCategory(parent: HTMLElement, group: BudgetSection[]) {
    const [main] = group
    const totals = categoryTotals(group)
    const card = renderCard(parent, { className: 'ne-budget-section' })
    const key = main.category
    if (this.collapsed.has(key)) card.addClass('is-collapsed')

    const head = card.createDiv({ cls: 'ne-budget-row ne-budget-head', attr: { role: 'button', 'aria-expanded': String(!this.collapsed.has(key)) } })
    const name = head.createSpan('ne-budget-name')
    setIcon(name.createSpan('ne-budget-chevron'), 'chevron-down')
    name.createSpan({ text: main.category })
    head.createSpan({ text: formatCents(totals.plannedCents), cls: 'ne-budget-amount ne-budget-muted' })
    head.createSpan({ text: formatCents(totals.actualCents), cls: 'ne-budget-amount' })
    this.renderBar(head, totals.progress)
    head.addEventListener('click', () => {
      if (this.collapsed.has(key)) this.collapsed.delete(key)
      else this.collapsed.add(key)
      card.toggleClass('is-collapsed', this.collapsed.has(key))
      head.setAttr('aria-expanded', String(!this.collapsed.has(key)))
    })

    const body = card.createDiv('ne-budget-body')
    for (const [i, section] of group.entries()) {
      if (group.length > 1 && i > 0) body.createDiv({ text: t(`label.type.${section.type}`), cls: 'ne-budget-subhead' })
      this.renderRows(body, section)
    }
  }

  private renderRows(body: HTMLElement, section: BudgetSection) {
    const cols = body.createDiv('ne-budget-row ne-budget-cols')
    cols.createSpan()
    cols.createSpan({ text: t('budget.planned'), cls: 'ne-budget-amount' })
    const actualLabel = { income: 'budget.received', expense: 'budget.spent', debt: 'budget.paid' } as const
    cols.createSpan({ text: t(actualLabel[section.type]), cls: 'ne-budget-amount' })
    cols.createSpan()

    for (const row of section.rows) {
      const line = body.createDiv('ne-budget-row')
      line.createSpan({ text: row.subcategory, cls: 'ne-budget-name' })
      this.renderPlannedInput(line, row.subcategory, row.plannedCents)
      line.createSpan({ text: formatCents(row.actualCents), cls: 'ne-budget-amount' })
      this.renderBar(line, row.progress)
    }
  }

  private renderPlannedInput(parent: HTMLElement, subcategory: string, plannedCents: number) {
    const input = parent.createEl('input', { type: 'text', cls: 'ne-budget-input' })
    input.inputMode = 'decimal'
    input.value = centsToDecimal(plannedCents)
    input.addEventListener('focus', () => input.select())
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur() })
    input.addEventListener('change', () => {
      const cents = parsePlanned(input.value)
      if (cents === null) {
        new Notice(t('budget.invalidAmount'))
        input.value = centsToDecimal(plannedCents)
        return
      }
      if (cents === plannedCents) return
      void this.run(() => this.ledger.budgets.setPlanned(this.yearMonth, subcategory, cents))
    })
  }

  private renderBar(parent: HTMLElement, progress: BudgetProgress) {
    const bar = parent.createDiv({ cls: 'ne-budget-bar', attr: { title: leftText(progress) } })
    const fill = bar.createDiv(`ne-budget-fill is-${progress.state}`)
    fill.style.width = barWidth(progress)
  }

  private async run(action: () => Promise<void>) {
    try {
      await action()
    } catch (e) {
      new Notice(e instanceof Error ? e.message : String(e))
    }
    (this.app.workspace as Events).trigger('nestegg:refresh')
  }
}
