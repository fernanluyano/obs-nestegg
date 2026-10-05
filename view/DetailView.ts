import { Events, ItemView, Platform, ViewStateResult, WorkspaceLeaf } from 'obsidian'
import { formatCents } from '../domain/money'
import type { LedgerEntry, TransactionType } from '../domain/types'
import { t } from '../labels'
import { MobileTransactionModal } from '../modal/MobileTransactionModal'
import { TransactionModal } from '../modal/TransactionModal'
import type { Ledger } from '../services/Ledger'
import { accountColors, monthEntries } from '../snapshot/queries'
import { balanceAccounts, dailyBalances } from '../snapshot/runningBalance'
import { currentYearMonth } from '../utils'
import { accountDropdown, categoryDropdown, dateRangeRow, searchRow, typePills } from './detail/controls'
import type { FilterHost } from './detail/FilterHost'
import { openDetailFilterSheet } from './detail/filterSheet'
import { applyFilters, countActiveFilters, emptyFilters, sortForDisplay, subtotals, type DetailFilters } from './detail/filters'
import { renderBalanceLegend, renderDayHeader } from './detail/dayHeader'
import { renderTxRow } from './detail/txRow'
import { renderSharedHeader } from './SharedHeader'

export const DETAIL_VIEW_TYPE = 'nestegg-detail'

export class DetailView extends ItemView {
  private yearMonth = currentYearMonth()
  private filters: DetailFilters = emptyFilters()
  private entries: LedgerEntry[] = []
  private panels = { category: { open: false }, account: { open: false } }
  private cleanups: (() => void)[] = []
  private listEl: HTMLElement | null = null
  private listWrapEl: HTMLElement | null = null
  private subtotalEl: HTMLElement | null = null

  constructor(leaf: WorkspaceLeaf, private ledger: Ledger) {
    super(leaf)
  }

  getViewType() { return DETAIL_VIEW_TYPE }
  getDisplayText() { return t('detail.title') }
  getIcon() { return 'wallet' }

  async setState(state: Record<string, unknown>, result: ViewStateResult) {
    if (state?.resetFilters) this.filters = emptyFilters()
    if (state?.yearMonth) this.yearMonth = state.yearMonth as string
    if (state?.filterType) this.filters.types = new Set([state.filterType as TransactionType])
    if (state?.filterCategory) this.filters.categories = new Set([state.filterCategory as string])
    await super.setState(state, result)
    await this.render()
  }

  async onOpen() {
    this.registerEvent((this.app.workspace as Events).on('nestegg:refresh', () => { void this.render() }))
    if (Platform.isMobile && window.visualViewport) this.trackKeyboard(window.visualViewport)
    await this.render()
  }

  private trackKeyboard(viewport: VisualViewport) {
    const el = this.contentEl
    const update = () => {
      const keyboard = Math.max(0, window.innerHeight - viewport.height)
      if (keyboard > 50) {
        el.style.setProperty('--ne-keyboard-h', `${keyboard}px`)
        el.addClass('ne-keyboard-open')
      } else {
        el.style.removeProperty('--ne-keyboard-h')
        el.removeClass('ne-keyboard-open')
      }
    }
    viewport.addEventListener('resize', update)
    this.cleanups.push(() => viewport.removeEventListener('resize', update))
  }

  onClose(): Promise<void> {
    this.runCleanups()
    this.contentEl.empty()
    return Promise.resolve()
  }

  private runCleanups() {
    this.cleanups.forEach(fn => fn())
    this.cleanups = []
  }

  private host(): FilterHost {
    const view = this
    return {
      get filters() { return view.filters },
      set filters(next) { view.filters = next },
      entries: this.entries,
      index: this.ledger.store.index,
      accounts: this.ledger.snapshot.accounts.map(a => a.account),
      yearMonth: this.yearMonth,
      refreshList: () => this.applyFilters(),
      rerender: () => { void this.render() },
      register: (fn) => this.cleanups.push(fn),
    }
  }

  async render() {
    const { contentEl } = this
    const savedScroll = this.listWrapEl?.scrollTop ?? 0
    this.runCleanups()
    contentEl.empty()
    contentEl.addClass('ne-detail')
    this.entries = sortForDisplay(monthEntries(this.ledger.snapshot, this.yearMonth))

    renderSharedHeader(contentEl, {
      view: this,
      ledger: this.ledger,
      activeView: 'detail',
      yearMonth: this.yearMonth,
      onMonthChange: (ym) => { this.yearMonth = ym; void this.render() },
    })

    const host = this.host()
    const header = contentEl.createDiv('ne-detail-header')
    if (Platform.isMobile) {
      searchRow(header, host, { count: countActiveFilters(this.filters), onClick: () => openDetailFilterSheet(this.containerEl, host) }, contentEl)
    } else {
      const pills = header.createDiv('ne-type-pills')
      typePills(pills, host)
      categoryDropdown(pills, host, this.panels.category)
      accountDropdown(pills, host, this.panels.account)
      dateRangeRow(header, host)
      searchRow(header, host, null, contentEl)
    }

    this.listWrapEl = contentEl.createDiv('ne-detail-list-wrap')
    this.listEl = this.listWrapEl.createDiv('ne-tx-list')
    this.subtotalEl = contentEl.createDiv('ne-subtotal-row')
    this.applyFilters()
    if (savedScroll > 0) this.listWrapEl.scrollTop = savedScroll
  }

  private applyFilters() {
    if (!this.listEl || !this.subtotalEl) return
    const { index } = this.ledger.store
    const shown = applyFilters(this.entries, this.filters, index)

    this.listEl.empty()
    if (shown.length === 0) this.listEl.createEl('p', { text: t('detail.noTransactions'), cls: 'ne-no-data' })
    const { snapshot, store } = this.ledger
    const chosen = [...this.filters.accounts]
    const balances = dailyBalances(snapshot, store.monthDeltas, this.yearMonth, chosen)
    const colors = accountColors(snapshot)
    if (shown.length > 0) renderBalanceLegend(this.listEl, balanceAccounts(snapshot, chosen), colors)
    let day = ''
    for (const entry of shown) {
      if (entry.date !== day) {
        day = entry.date
        renderDayHeader(this.listEl, day, balances.get(day), colors)
      }
      renderTxRow(this.listEl, entry, index.typeOf(entry.subcategory), () => this.edit(entry))
    }

    const { incomeCents, expenseCents } = subtotals(shown, index)
    this.subtotalEl.empty()
    this.subtotalEl.createEl('span', { text: `${t('detail.subtotalExpense')}: ${formatCents(expenseCents)}`, cls: 'ne-subtotal-expense' })
    this.subtotalEl.createEl('span', { text: `${t('detail.subtotalIncome')}: ${formatCents(incomeCents)}`, cls: 'ne-subtotal-income' })
  }

  private edit(entry: LedgerEntry) {
    const ModalClass = Platform.isMobile ? MobileTransactionModal : TransactionModal
    new ModalClass(this.app, this.ledger, {}, entry, () => (this.app.workspace as Events).trigger('nestegg:refresh')).open()
  }
}
