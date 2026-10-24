import { Events, ItemView, Notice, Platform, ViewStateResult, WorkspaceLeaf } from 'obsidian'
import { bulkReassignTargets } from '../domain/bulkEdit'
import { formatCents } from '../domain/money'
import type { LedgerEntry, TransactionType } from '../domain/types'
import { t, tn } from '../labels'
import { ConfirmDialog } from '../modal/ConfirmDialog'
import { EntryFormModal } from '../modal/EntryFormModal'
import { MobileEntryFormModal } from '../modal/MobileEntryFormModal'
import { SubcategoryPickModal } from '../modal/SubcategoryPickModal'
import type { Ledger } from '../services/Ledger'
import { accountColors, monthEntries } from '../snapshot/queries'
import { balanceAccounts, dailyBalances, hiddenBalances } from '../snapshot/runningBalance'
import { thisMonth } from '../helpers'
import { accountDropdown, categoryDropdown, dateRangeRow, searchRow, typePills, untaggedToggle } from './detail/controls'
import type { FilterHost } from './detail/FilterHost'
import { openDetailFilterSheet } from './detail/filterSheet'
import { applyFilters, countActiveFilters, emptyFilters, sortForDisplay, subtotals, type DetailFilters } from './detail/filters'
import { renderBulkBar } from './detail/bulkBar'
import { renderBalanceLegend, renderDayHeader } from './detail/dayHeader'
import { BULK_PROBLEM_LABELS, entryKeys, pickEntries, pruneSelection, toggleAll, toggleKey } from './detail/selection'
import { NESTEGG_ICON } from '../plugin/icon'
import { renderTxRow } from './detail/txRow'
import { drawPageHeader } from './PageHeader'

// The string is saved in users' workspaces, so it keeps its original value.
export const TRANSACTIONS_VIEW_TYPE = 'nestegg-detail'

const KEYBOARD_MIN_HEIGHT_PX = 50

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

// The month's transactions: filters on top, rows grouped by day, and a bulk-edit mode.
export class TransactionsView extends ItemView {
  private month = thisMonth()
  private filters: DetailFilters = emptyFilters()
  private entries: LedgerEntry[] = []
  private openPanels = { category: { open: false }, account: { open: false } }
  private teardown: (() => void)[] = []
  private listBox: HTMLElement | null = null
  private scroller: HTMLElement | null = null
  private totalsLine: HTMLElement | null = null
  private bulkHost: HTMLElement | null = null
  private selectMode = false
  private picked = new Set<string>()
  private keys: string[] = []
  private keyOf = new Map<LedgerEntry, string>()
  private visible: LedgerEntry[] = []

  constructor(leaf: WorkspaceLeaf, private ledger: Ledger) {
    super(leaf)
  }

  getViewType() { return TRANSACTIONS_VIEW_TYPE }
  getDisplayText() { return t('detail.title') }
  getIcon() { return NESTEGG_ICON }

  async setState(state: Record<string, unknown>, result: ViewStateResult) {
    if (state?.resetFilters) this.filters = emptyFilters()
    if (state?.yearMonth) this.goToMonth(state.yearMonth as string)
    if (state?.filterType) this.filters.types = new Set([state.filterType as TransactionType])
    if (state?.filterCategory) this.filters.categories = new Set([state.filterCategory as string])
    await super.setState(state, result)
    await this.render()
  }

  async onOpen() {
    this.registerEvent((this.app.workspace as Events).on('nestegg:refresh', () => { void this.render() }))
    if (Platform.isMobile && window.visualViewport) this.followKeyboard(window.visualViewport)
    await this.render()
  }

  private followKeyboard(viewport: VisualViewport) {
    const host = this.contentEl
    const sync = () => {
      const covered = Math.max(0, window.innerHeight - viewport.height)
      if (covered > KEYBOARD_MIN_HEIGHT_PX) {
        host.style.setProperty('--ne-keyboard-h', `${covered}px`)
        host.addClass('ne-keyboard-open')
      } else {
        host.style.removeProperty('--ne-keyboard-h')
        host.removeClass('ne-keyboard-open')
      }
    }
    viewport.addEventListener('resize', sync)
    this.teardown.push(() => viewport.removeEventListener('resize', sync))
  }

  onClose(): Promise<void> {
    this.runTeardown()
    this.contentEl.empty()
    return Promise.resolve()
  }

  private runTeardown() {
    this.teardown.forEach(undo => undo())
    this.teardown = []
  }

  // Rows picked in one month mean nothing in another, so a new month starts with a clean slate.
  private goToMonth(month: string) {
    if (month === this.month) return
    this.month = month
    this.selectMode = false
    this.picked = new Set()
  }

  private filterHost(): FilterHost {
    const view = this
    return {
      get filters() { return view.filters },
      set filters(next) { view.filters = next },
      entries: this.entries,
      index: this.ledger.store.index,
      accounts: this.ledger.snapshot.accounts.map(record => record.account),
      yearMonth: this.month,
      refreshList: () => this.drawList(),
      rerender: () => { void this.render() },
      register: (undo) => this.teardown.push(undo),
    }
  }

  async render() {
    const { contentEl } = this
    const scrollTop = this.scroller?.scrollTop ?? 0
    this.runTeardown()
    contentEl.empty()
    contentEl.addClass('ne-detail')
    this.entries = sortForDisplay(monthEntries(this.ledger.snapshot, this.month))
    this.keys = entryKeys(this.entries)
    this.keyOf = new Map(this.entries.map((entry, i) => [entry, this.keys[i]]))
    this.picked = pruneSelection(this.picked, this.keys)

    drawPageHeader(contentEl, {
      owner: this,
      ledger: this.ledger,
      page: 'detail',
      month: this.month,
      onMonth: (month) => { this.goToMonth(month); void this.render() },
    })

    const host = this.filterHost()
    const top = contentEl.createDiv('ne-detail-header')
    if (Platform.isMobile) {
      const onClick = () => openDetailFilterSheet(this.containerEl, host)
      searchRow(top, host, { count: countActiveFilters(this.filters), onClick }, contentEl)
    } else {
      const pills = top.createDiv('ne-type-pills')
      typePills(pills, host)
      categoryDropdown(pills, host, this.openPanels.category)
      accountDropdown(pills, host, this.openPanels.account)
      untaggedToggle(pills, host)
      dateRangeRow(top, host)
      searchRow(top, host, null, contentEl)
    }

    if (!this.selectMode) {
      top.createEl('button', { text: t('bulk.select'), cls: 'ne-action-btn ne-detail-select-btn' })
        .addEventListener('click', () => { this.selectMode = true; void this.render() })
    }

    this.scroller = contentEl.createDiv('ne-detail-list-wrap')
    this.listBox = this.scroller.createDiv('ne-tx-list')
    this.bulkHost = contentEl.createDiv('ne-bulk-bar-host')
    this.totalsLine = contentEl.createDiv('ne-subtotal-row')
    this.drawList()
    if (scrollTop > 0) this.scroller.scrollTop = scrollTop
  }

  private drawList() {
    if (!this.listBox || !this.totalsLine) return
    const { index } = this.ledger.store
    const rows = applyFilters(this.entries, this.filters, index)
    this.visible = rows

    this.listBox.empty()
    if (rows.length === 0) this.listBox.createEl('p', { text: t('detail.noTransactions'), cls: 'ne-no-data' })
    const { ledger } = this
    const { snapshot, store } = ledger
    const accountFilter = [...this.filters.accounts]
    const balances = dailyBalances(snapshot, store.monthDeltas, this.month, accountFilter)
    const colors = accountColors(snapshot)
    if (rows.length > 0) {
      renderBalanceLegend(this.listBox, balanceAccounts(snapshot, accountFilter), colors, {
        hidden: hiddenBalances(snapshot, this.month),
        toggleable: new Set(snapshot.months.filter(m => m.month === this.month).map(m => m.account)),
        onToggle: (account, on) => {
          ledger.transactions.setBalanceShown(account, this.month, on)
            .then(() => this.drawList())
            .catch((error: unknown) => new Notice(messageOf(error)))
        },
      })
    }
    let currentDay = ''
    let dayBox = this.listBox
    for (const entry of rows) {
      if (entry.date !== currentDay) {
        currentDay = entry.date
        dayBox = this.listBox.createDiv('ne-day-group')
        renderDayHeader(dayBox, currentDay, balances.get(currentDay), colors)
      }
      const key = this.keyOf.get(entry)!
      renderTxRow(
        dayBox, entry, index.typeOf(entry.subcategory), colors,
        () => (this.selectMode ? this.togglePick(key) : this.editEntry(entry)),
        this.selectMode ? { selected: this.picked.has(key) } : undefined,
      )
    }
    this.drawBulkBar()

    const { incomeCents, expenseCents } = subtotals(rows, index)
    this.totalsLine.empty()
    this.totalsLine.createEl('span', { text: `${t('detail.subtotalExpense')}: ${formatCents(expenseCents)}`, cls: 'ne-subtotal-expense' })
    this.totalsLine.createEl('span', { text: `${t('detail.subtotalIncome')}: ${formatCents(incomeCents)}`, cls: 'ne-subtotal-income' })
  }

  private togglePick(key: string) {
    this.picked = toggleKey(this.picked, key)
    this.drawList()
  }

  private pickedEntries(): LedgerEntry[] {
    return pickEntries(this.entries, this.keys, this.picked)
  }

  private drawBulkBar() {
    if (!this.bulkHost) return
    this.bulkHost.empty()
    if (!this.selectMode) return
    const rows = this.pickedEntries()
    const visibleKeys = this.visible.map(entry => this.keyOf.get(entry)!)
    const targets = bulkReassignTargets(rows, this.categoryList(), this.ledger.store.index)
    renderBulkBar(this.bulkHost, {
      count: rows.length,
      allShownSelected: visibleKeys.length > 0 && visibleKeys.every(key => this.picked.has(key)),
      reassignBlockedReason: targets.ok || targets.problem === 'empty' ? null : t(BULK_PROBLEM_LABELS[targets.problem]),
      onToggleAll: () => { this.picked = toggleAll(this.picked, visibleKeys); this.drawList() },
      onDelete: () => this.askDeleteMany(rows),
      onReassign: () => this.askReassign(rows),
      onDone: () => { this.selectMode = false; this.picked = new Set(); void this.render() },
    })
  }

  private categoryList() {
    return this.ledger.snapshot.categories.map(record => record.category)
  }

  private askDeleteMany(rows: LedgerEntry[]) {
    const count = String(rows.length)
    new ConfirmDialog(this.app, tn('bulk.confirmDelete', { count }), () =>
      this.runBulkAction(() => this.ledger.transactions.deleteMany(rows), tn('notice.bulkDeleted', { count }))).open()
  }

  private askReassign(rows: LedgerEntry[]) {
    const targets = bulkReassignTargets(rows, this.categoryList(), this.ledger.store.index)
    if (!targets.ok) return
    const count = String(rows.length)
    new SubcategoryPickModal(this.app, {
      title: tn('bulk.reassignTitle', { count }),
      intro: t('bulk.reassignIntro'),
      label: t('bulk.reassignLabel'),
      confirmText: t('bulk.reassignConfirm'),
      emptyText: t('bulk.reassignNone'),
      targets: targets.targets,
      onConfirm: (subcategory) => this.runBulkAction(() => this.ledger.transactions.reassignMany(rows, subcategory), tn('notice.bulkReassigned', { count })),
    }).open()
  }

  // A finished action ends selection mode; a failed one leaves it as it was.
  private async runBulkAction(action: () => Promise<void>, notice: string) {
    try {
      await action()
    } catch (error) {
      new Notice(messageOf(error))
      return
    }
    new Notice(notice)
    this.selectMode = false
    this.picked = new Set()
    ;(this.app.workspace as Events).trigger('nestegg:refresh')
  }

  private editEntry(entry: LedgerEntry) {
    const FormModal = Platform.isMobile ? MobileEntryFormModal : EntryFormModal
    new FormModal(this.app, this.ledger, {}, entry, () => (this.app.workspace as Events).trigger('nestegg:refresh')).open()
  }
}
