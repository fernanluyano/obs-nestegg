import { Events, ItemView, Notice, Platform, ViewStateResult, WorkspaceLeaf } from 'obsidian'
import { bulkReassignTargets } from '../domain/bulkEdit'
import { formatCents } from '../domain/money'
import type { LedgerEntry, TransactionType } from '../domain/types'
import { t, tn } from '../labels'
import { ConfirmModal } from '../modal/ConfirmModal'
import { MobileTransactionModal } from '../modal/MobileTransactionModal'
import { SubcategoryPickModal } from '../modal/SubcategoryPickModal'
import { TransactionModal } from '../modal/TransactionModal'
import type { Ledger } from '../services/Ledger'
import { accountColors, monthEntries } from '../snapshot/queries'
import { balanceAccounts, dailyBalances, hiddenBalances } from '../snapshot/runningBalance'
import { currentYearMonth } from '../utils'
import { accountDropdown, categoryDropdown, dateRangeRow, searchRow, typePills, untaggedToggle } from './detail/controls'
import type { FilterHost } from './detail/FilterHost'
import { openDetailFilterSheet } from './detail/filterSheet'
import { applyFilters, countActiveFilters, emptyFilters, sortForDisplay, subtotals, type DetailFilters } from './detail/filters'
import { renderBulkBar } from './detail/bulkBar'
import { renderBalanceLegend, renderDayHeader } from './detail/dayHeader'
import { BULK_PROBLEM_LABELS, entryKeys, pickEntries, pruneSelection, toggleAll, toggleKey } from './detail/selection'
import { NESTEGG_ICON } from '../plugin/icon'
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
  private barEl: HTMLElement | null = null
  private selecting = false
  private selected = new Set<string>()
  private keys: string[] = []
  private keyOf = new Map<LedgerEntry, string>()
  private shown: LedgerEntry[] = []

  constructor(leaf: WorkspaceLeaf, private ledger: Ledger) {
    super(leaf)
  }

  getViewType() { return DETAIL_VIEW_TYPE }
  getDisplayText() { return t('detail.title') }
  getIcon() { return NESTEGG_ICON }

  async setState(state: Record<string, unknown>, result: ViewStateResult) {
    if (state?.resetFilters) this.filters = emptyFilters()
    if (state?.yearMonth) this.changeMonth(state.yearMonth as string)
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

  // Rows picked in one month mean nothing in another, so a new month starts with a clean slate.
  private changeMonth(yearMonth: string) {
    if (yearMonth === this.yearMonth) return
    this.yearMonth = yearMonth
    this.selecting = false
    this.selected = new Set()
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
    this.keys = entryKeys(this.entries)
    this.keyOf = new Map(this.entries.map((e, i) => [e, this.keys[i]]))
    this.selected = pruneSelection(this.selected, this.keys)

    renderSharedHeader(contentEl, {
      view: this,
      ledger: this.ledger,
      activeView: 'detail',
      yearMonth: this.yearMonth,
      onMonthChange: (ym) => { this.changeMonth(ym); void this.render() },
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
      untaggedToggle(pills, host)
      dateRangeRow(header, host)
      searchRow(header, host, null, contentEl)
    }

    if (!this.selecting) {
      header.createEl('button', { text: t('bulk.select'), cls: 'ne-action-btn ne-detail-select-btn' })
        .addEventListener('click', () => { this.selecting = true; void this.render() })
    }

    this.listWrapEl = contentEl.createDiv('ne-detail-list-wrap')
    this.listEl = this.listWrapEl.createDiv('ne-tx-list')
    this.barEl = contentEl.createDiv('ne-bulk-bar-host')
    this.subtotalEl = contentEl.createDiv('ne-subtotal-row')
    this.applyFilters()
    if (savedScroll > 0) this.listWrapEl.scrollTop = savedScroll
  }

  private applyFilters() {
    if (!this.listEl || !this.subtotalEl) return
    const { index } = this.ledger.store
    const shown = applyFilters(this.entries, this.filters, index)
    this.shown = shown

    this.listEl.empty()
    if (shown.length === 0) this.listEl.createEl('p', { text: t('detail.noTransactions'), cls: 'ne-no-data' })
    const { ledger } = this
    const { snapshot, store } = ledger
    const chosen = [...this.filters.accounts]
    const balances = dailyBalances(snapshot, store.monthDeltas, this.yearMonth, chosen)
    const colors = accountColors(snapshot)
    if (shown.length > 0) {
      renderBalanceLegend(this.listEl, balanceAccounts(snapshot, chosen), colors, {
        hidden: hiddenBalances(snapshot, this.yearMonth),
        toggleable: new Set(snapshot.months.filter(m => m.month === this.yearMonth).map(m => m.account)),
        onToggle: (account, on) => {
          ledger.transactions.setBalanceShown(account, this.yearMonth, on)
            .then(() => this.applyFilters())
            .catch((e: unknown) => new Notice(e instanceof Error ? e.message : String(e)))
        },
      })
    }
    let day = ''
    let group = this.listEl
    for (const entry of shown) {
      if (entry.date !== day) {
        day = entry.date
        group = this.listEl.createDiv('ne-day-group')
        renderDayHeader(group, day, balances.get(day), colors)
      }
      const key = this.keyOf.get(entry)!
      renderTxRow(
        group, entry, index.typeOf(entry.subcategory), colors,
        () => (this.selecting ? this.toggle(key) : this.edit(entry)),
        this.selecting ? { selected: this.selected.has(key) } : undefined,
      )
    }
    this.renderBar()

    const { incomeCents, expenseCents } = subtotals(shown, index)
    this.subtotalEl.empty()
    this.subtotalEl.createEl('span', { text: `${t('detail.subtotalExpense')}: ${formatCents(expenseCents)}`, cls: 'ne-subtotal-expense' })
    this.subtotalEl.createEl('span', { text: `${t('detail.subtotalIncome')}: ${formatCents(incomeCents)}`, cls: 'ne-subtotal-income' })
  }

  private toggle(key: string) {
    this.selected = toggleKey(this.selected, key)
    this.applyFilters()
  }

  private selectedEntries(): LedgerEntry[] {
    return pickEntries(this.entries, this.keys, this.selected)
  }

  private renderBar() {
    if (!this.barEl) return
    this.barEl.empty()
    if (!this.selecting) return
    const rows = this.selectedEntries()
    const shownKeys = this.shown.map(e => this.keyOf.get(e)!)
    const targets = bulkReassignTargets(rows, this.categories(), this.ledger.store.index)
    renderBulkBar(this.barEl, {
      count: rows.length,
      allShownSelected: shownKeys.length > 0 && shownKeys.every(k => this.selected.has(k)),
      reassignBlockedReason: targets.ok || targets.problem === 'empty' ? null : t(BULK_PROBLEM_LABELS[targets.problem]),
      onToggleAll: () => { this.selected = toggleAll(this.selected, shownKeys); this.applyFilters() },
      onDelete: () => this.confirmDelete(rows),
      onReassign: () => this.pickSubcategory(rows),
      onDone: () => { this.selecting = false; this.selected = new Set(); void this.render() },
    })
  }

  private categories() {
    return this.ledger.snapshot.categories.map(c => c.category)
  }

  private confirmDelete(rows: LedgerEntry[]) {
    const count = String(rows.length)
    new ConfirmModal(this.app, tn('bulk.confirmDelete', { count }), () =>
      this.runBulk(() => this.ledger.transactions.deleteMany(rows), tn('notice.bulkDeleted', { count }))).open()
  }

  private pickSubcategory(rows: LedgerEntry[]) {
    const result = bulkReassignTargets(rows, this.categories(), this.ledger.store.index)
    if (!result.ok) return
    const count = String(rows.length)
    new SubcategoryPickModal(this.app, {
      title: tn('bulk.reassignTitle', { count }),
      intro: t('bulk.reassignIntro'),
      label: t('bulk.reassignLabel'),
      confirmText: t('bulk.reassignConfirm'),
      emptyText: t('bulk.reassignNone'),
      targets: result.targets,
      onConfirm: (subcategory) => this.runBulk(() => this.ledger.transactions.reassignMany(rows, subcategory), tn('notice.bulkReassigned', { count })),
    }).open()
  }

  // A finished action ends selection mode; a failed one leaves it as it was.
  private async runBulk(action: () => Promise<void>, notice: string) {
    try {
      await action()
    } catch (e) {
      new Notice(e instanceof Error ? e.message : String(e))
      return
    }
    new Notice(notice)
    this.selecting = false
    this.selected = new Set()
    ;(this.app.workspace as Events).trigger('nestegg:refresh')
  }

  private edit(entry: LedgerEntry) {
    const ModalClass = Platform.isMobile ? MobileTransactionModal : TransactionModal
    new ModalClass(this.app, this.ledger, {}, entry, () => (this.app.workspace as Events).trigger('nestegg:refresh')).open()
  }
}
