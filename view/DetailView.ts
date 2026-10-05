import { Events, ItemView, Platform, ViewStateResult, WorkspaceLeaf } from 'obsidian'
import { WalletFile } from '../io/WalletFile'
import { TransactionModal } from '../modal/TransactionModal'
import { MobileTransactionModal } from '../modal/MobileTransactionModal'
import { openFilterSheet } from '../modal/BottomSheetPicker'
import { t, translateCategory } from '../labels'
import { Transaction, TransactionType } from '../types'
import { currentYearMonth } from '../utils'
import { formatCents } from '../money'
import { renderSharedHeader } from './SharedHeader'
import { buildAmountDisplay, buildLine3Display, buildWalletText } from './detailRow'

export const DETAIL_VIEW_TYPE = 'nestegg-detail'

export class DetailView extends ItemView {
  private walletFile: WalletFile
  private currentYearMonth: string
  private filterTypes: Set<TransactionType> = new Set()   // empty = all
  private filterCategories: Set<string> = new Set()       // empty = all
  private filterWallets: Set<string> = new Set()          // empty = all
  private filterDateFrom: string | null = null            // YYYY-MM-DD; null = no lower bound
  private filterDateTo: string | null = null              // YYYY-MM-DD; null = no upper bound
  private filterSearch: string = ''
  private catPanelOpen: boolean = false
  private accountPanelOpen: boolean = false

  private viewportCleanup: (() => void) | undefined

  // Refs for lightweight list updates (search)
  private cachedTransactions: Transaction[] = []
  private listEl: HTMLElement | null = null
  private listWrapEl: HTMLElement | null = null
  private subtotalEl: HTMLElement | null = null

  constructor(leaf: WorkspaceLeaf, walletFile: WalletFile) {
    super(leaf)
    this.walletFile = walletFile
    this.currentYearMonth = currentYearMonth()
  }

  getViewType() { return DETAIL_VIEW_TYPE }
  getDisplayText() { return t('detail.title') }
  getIcon() { return 'wallet' }

  async setState(state: Record<string, unknown>, result: ViewStateResult) {
    if (state?.resetFilters) {
      this.filterTypes.clear()
      this.filterCategories.clear()
      this.filterWallets.clear()
      this.filterDateFrom = null
      this.filterDateTo = null
      this.filterSearch = ''
    }
    if (state?.yearMonth) this.currentYearMonth = state.yearMonth as string
    if (state?.filterType) this.filterTypes = new Set([state.filterType as TransactionType])
    if (state?.filterCategory) this.filterCategories = new Set([state.filterCategory as string])
    await super.setState(state, result)
    await this.render()
  }

  async onOpen() {
    this.registerEvent(
      (this.app.workspace as Events).on('nestegg:refresh', () => { void this.render() })
    )
    if (Platform.isMobile && window.visualViewport) {
      const el = this.contentEl
      const update = () => {
        const kbHeight = Math.max(0, window.innerHeight - window.visualViewport!.height)
        if (kbHeight > 50) {
          el.style.setProperty('--ne-keyboard-h', `${kbHeight}px`)
          el.addClass('ne-keyboard-open')
        } else {
          el.style.removeProperty('--ne-keyboard-h')
          el.removeClass('ne-keyboard-open')
        }
      }
      window.visualViewport.addEventListener('resize', update)
      this.viewportCleanup = () => window.visualViewport?.removeEventListener('resize', update)
    }
    await this.render()
  }

  onClose(): Promise<void> {
    this.viewportCleanup?.()
    this.viewportCleanup = undefined
    this.contentEl.empty()
    return Promise.resolve()
  }

  async render() {
    const { contentEl } = this
    const savedScroll = this.listWrapEl?.scrollTop ?? 0
    contentEl.empty()
    contentEl.addClass('ne-detail')

    await this.ensureCacheForCurrentFilter()

    renderSharedHeader(contentEl, {
      view: this,
      walletFile: this.walletFile,
      activeView: 'detail',
      yearMonth: this.currentYearMonth,
      onMonthChange: (ym) => {
        this.currentYearMonth = ym
        void this.render()
      },
    })

    const filtersWrap = contentEl.createDiv('ne-detail-header')
    if (Platform.isMobile) {
      this.renderSearchRow(filtersWrap, true)
    } else {
      this.renderTypePills(filtersWrap)
      this.renderDateRangeRow(filtersWrap)
      this.renderSearchRow(filtersWrap, false)
    }

    const listWrap = contentEl.createDiv('ne-detail-list-wrap')
    this.listWrapEl = listWrap
    this.listEl = listWrap.createDiv('ne-tx-list')
    this.subtotalEl = contentEl.createDiv('ne-subtotal-row')

    this.applyFilters()
    if (savedScroll > 0) listWrap.scrollTop = savedScroll
  }

  private async ensureCacheForCurrentFilter() {
    this.cachedTransactions = (await this.walletFile.readMonth(this.currentYearMonth))
      .sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date)
        if (dateCompare !== 0) return dateCompare
        if (a.createdAt && b.createdAt) return b.createdAt.localeCompare(a.createdAt)
        return 0
      })
  }

  private getMonthDateDefaults(): { from: string; to: string } {
    const [y, m] = this.currentYearMonth.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()
    return {
      from: `${this.currentYearMonth}-01`,
      to: `${this.currentYearMonth}-${String(last).padStart(2, '0')}`,
    }
  }

  private renderCategoryDropdown(container: HTMLElement): void {
    const showCategories = this.filterTypes.size === 0 ||
      this.filterTypes.has('expense') ||
      this.filterTypes.has('income') ||
      this.filterTypes.has('transfer')

    if (!showCategories) return

    const catSource = this.cachedTransactions.filter(tx => {
      if (this.filterTypes.size === 0) return tx.type === 'expense' || tx.type === 'income' || tx.type === 'transfer'
      return this.filterTypes.has(tx.type)
    })
    const allCategories = new Set<string>()
    catSource.forEach(tx => { if (tx.category) allCategories.add(tx.category) })

    for (const cat of this.filterCategories) {
      if (!allCategories.has(cat)) this.filterCategories.delete(cat)
    }

    if (allCategories.size === 0) return

    const catDropdown = container.createDiv('ne-cat-dropdown')

    const catToggleBtn = catDropdown.createEl('button', { cls: 'ne-cat-toggle' })
    const updateToggleLabel = () => {
      const badge = this.filterCategories.size > 0 ? ` · ${this.filterCategories.size}` : ''
      catToggleBtn.setText(`${t('detail.filterCategory')}${badge} ${this.catPanelOpen ? '▴' : '▾'}`)
      catToggleBtn.toggleClass('is-active', this.filterCategories.size > 0)
    }
    updateToggleLabel()

    const catPanel = catDropdown.createDiv('ne-cat-panel')
    if (!this.catPanelOpen) catPanel.hide()

    const onOutsideClick = (e: MouseEvent) => {
      if (!catDropdown.contains(e.target as Node)) {
        this.catPanelOpen = false
        catPanel.hide()
        updateToggleLabel()
        document.removeEventListener('click', onOutsideClick)
      }
    }
    this.register(() => document.removeEventListener('click', onOutsideClick))

    if (this.catPanelOpen) {
      document.addEventListener('click', onOutsideClick)
    }

    catToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      this.catPanelOpen = !this.catPanelOpen
      if (this.catPanelOpen) {
        catPanel.show()
        document.addEventListener('click', onOutsideClick)
      } else {
        catPanel.hide()
        document.removeEventListener('click', onOutsideClick)
      }
      updateToggleLabel()
    })

    const allItem = catPanel.createDiv('ne-cat-item')
    const allCheck = allItem.createEl('span', { cls: 'ne-cat-check' + (this.filterCategories.size === 0 ? ' is-checked' : '') })
    if (this.filterCategories.size === 0) allCheck.setText('✓')
    allItem.createEl('span', { text: t('detail.filterAll') })
    allItem.addEventListener('click', () => {
      this.filterCategories.clear()
      catPanel.querySelectorAll('.ne-cat-check').forEach((el, i) => {
        if (i === 0) { el.addClass('is-checked'); el.setText('✓') }
        else { el.removeClass('is-checked'); el.setText('') }
      })
      updateToggleLabel()
      this.applyFilters()
    })

    for (const cat of allCategories) {
      const item = catPanel.createDiv('ne-cat-item')
      const isChecked = this.filterCategories.has(cat)
      const check = item.createEl('span', { cls: 'ne-cat-check' + (isChecked ? ' is-checked' : '') })
      if (isChecked) check.setText('✓')
      item.createEl('span', { text: translateCategory(cat) })
      item.addEventListener('click', () => {
        if (this.filterCategories.has(cat)) {
          this.filterCategories.delete(cat)
          check.removeClass('is-checked')
          check.setText('')
        } else {
          this.filterCategories.add(cat)
          check.addClass('is-checked')
          check.setText('✓')
        }
        const allCheckEl = catPanel.querySelector('.ne-cat-item:first-child .ne-cat-check')
        if (allCheckEl) {
          if (this.filterCategories.size === 0) { allCheckEl.addClass('is-checked'); allCheckEl.textContent = '✓' }
          else { allCheckEl.removeClass('is-checked'); allCheckEl.textContent = '' }
        }
        updateToggleLabel()
        this.applyFilters()
      })
    }
  }

  private renderTypePills(header: HTMLElement): void {
    const typePills = header.createDiv('ne-type-pills')

    const allTypePill = typePills.createEl('button', {
      text: t('detail.filterAll'),
      cls: 'ne-pill ne-pill-color-neutral' + (this.filterTypes.size === 0 ? ' is-active' : ''),
    })
    const allPillHandler = () => {
      this.filterTypes.clear()
      void this.render()
    }
    allTypePill.addEventListener('touchend', (e) => { e.preventDefault(); allPillHandler() })
    allTypePill.addEventListener('click', allPillHandler)

    const typeOptions: { value: TransactionType; label: string }[] = [
      { value: 'expense',  label: t('detail.filterExpense') },
      { value: 'income',   label: t('detail.filterIncome') },
      { value: 'transfer', label: t('detail.filterTransfer') },
    ]
    for (const opt of typeOptions) {
      const pill = typePills.createEl('button', {
        text: opt.label,
        cls: `ne-pill ne-pill-color-${opt.value}` + (this.filterTypes.has(opt.value) ? ' is-active' : ''),
      })
      const pillHandler = () => {
        if (this.filterTypes.has(opt.value)) {
          this.filterTypes.delete(opt.value)
        } else {
          this.filterTypes.add(opt.value)
        }
        void this.render()
      }
      pill.addEventListener('touchend', (e) => { e.preventDefault(); pillHandler() })
      pill.addEventListener('click', pillHandler)
    }

    this.renderCategoryDropdown(typePills)
    this.renderAccountDropdown(typePills)
  }

  private renderSearchRow(header: HTMLElement, includeFilterButton: boolean): void {
    const row = header.createDiv('ne-detail-search-row')

    const searchInput = row.createEl('input', {
      cls: 'ne-search-input',
      placeholder: t('detail.searchPlaceholder'),
    })
    searchInput.dataset['testid'] = 'detail-search'
    searchInput.type = 'text'
    searchInput.setAttribute('enterkeyhint', 'done')
    searchInput.value = this.filterSearch
    searchInput.addEventListener('input', () => {
      this.filterSearch = searchInput.value
      this.applyFilters()
    })
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchInput.blur()
    })
    if (Platform.isMobile) {
      searchInput.addEventListener('focus', () => this.contentEl.addClass('ne-keyboard-open'))
      searchInput.addEventListener('blur', () => this.contentEl.removeClass('ne-keyboard-open'))
    }

    if (includeFilterButton) {
      const activeCount = this.countActiveFilters()
      const label = activeCount > 0
        ? `${t('detail.filterButton')} (${activeCount}) ▾`
        : `${t('detail.filterButton')} ▾`
      const filterBtn = row.createEl('button', {
        cls: 'ne-filter-btn' + (activeCount > 0 ? ' is-active' : ''),
        text: label,
      })
      filterBtn.dataset['testid'] = 'detail-filter-btn'
      filterBtn.addEventListener('click', () => this.openFilterSheet())
    }
  }

  private countActiveFilters(): number {
    let n = 0
    if (this.filterTypes.size > 0) n++
    if (this.filterCategories.size > 0) n++
    if (this.filterWallets.size > 0) n++
    if (this.filterDateFrom !== null) n++
    if (this.filterDateTo !== null) n++
    if (this.filterSearch !== '') n++
    return n
  }

  private renderAccountDropdown(container: HTMLElement): void {
    const wallets = this.walletFile.getConfig().wallets.filter(w => w.status === 'active')
    if (wallets.length === 0) return

    const dropdown = container.createDiv('ne-account-dropdown')

    const toggleBtn = dropdown.createEl('button', { cls: 'ne-cat-toggle' })
    const updateLabel = () => {
      const arrow = this.accountPanelOpen ? '▴' : '▾'
      const count = this.filterWallets.size
      let text: string
      if (count === 0) text = t('detail.filterAccount')
      else if (count === 1) text = `${t('detail.filterAccount')}: ${[...this.filterWallets][0]}`
      else text = `${t('detail.filterAccount')} (${count})`
      toggleBtn.setText(`${text} ${arrow}`)
      toggleBtn.toggleClass('is-active', count > 0)
    }
    updateLabel()

    const panel = dropdown.createDiv('ne-cat-panel')
    if (!this.accountPanelOpen) panel.hide()

    const onOutsideClick = (e: MouseEvent) => {
      if (!dropdown.contains(e.target as Node)) {
        this.accountPanelOpen = false
        panel.hide()
        updateLabel()
        document.removeEventListener('click', onOutsideClick)
      }
    }
    this.register(() => document.removeEventListener('click', onOutsideClick))

    if (this.accountPanelOpen) document.addEventListener('click', onOutsideClick)

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      this.accountPanelOpen = !this.accountPanelOpen
      if (this.accountPanelOpen) {
        panel.show()
        document.addEventListener('click', onOutsideClick)
      } else {
        panel.hide()
        document.removeEventListener('click', onOutsideClick)
      }
      updateLabel()
    })

    // Multi-select: clicking an item toggles + refreshes panel without closing.
    // Outside click closes the panel (handled above).
    const buildPanelItems = () => {
      panel.empty()

      const allItem = panel.createDiv('ne-cat-item')
      const allEmpty = this.filterWallets.size === 0
      const allCheck = allItem.createEl('span', { cls: 'ne-cat-check' + (allEmpty ? ' is-checked' : '') })
      if (allEmpty) allCheck.setText('✓')
      allItem.createEl('span', { text: t('detail.filterAllAccounts') })
      allItem.addEventListener('click', (e) => {
        e.stopPropagation()
        this.filterWallets.clear()
        buildPanelItems()
        updateLabel()
        this.applyFilters()
      })

      for (const w of wallets) {
        const item = panel.createDiv('ne-cat-item')
        const isChecked = this.filterWallets.has(w.name)
        const check = item.createEl('span', { cls: 'ne-cat-check' + (isChecked ? ' is-checked' : '') })
        if (isChecked) check.setText('✓')
        item.createEl('span', { text: w.name })
        item.addEventListener('click', (e) => {
          e.stopPropagation()
          if (this.filterWallets.has(w.name)) this.filterWallets.delete(w.name)
          else this.filterWallets.add(w.name)
          buildPanelItems()
          updateLabel()
          this.applyFilters()
        })
      }
    }
    buildPanelItems()
  }

  private renderDateRangeRow(header: HTMLElement): void {
    const row = header.createDiv('ne-detail-date-row')
    const defaults = this.getMonthDateDefaults()

    const fromInput = row.createEl('input', { cls: 'ne-date-input' })
    fromInput.type = 'date'
    fromInput.min = defaults.from
    fromInput.max = defaults.to
    fromInput.value = this.filterDateFrom ?? defaults.from
    fromInput.dataset['testid'] = 'date-input-from'
    fromInput.addEventListener('change', () => {
      this.filterDateFrom = fromInput.value || null
      void this.render()
    })

    row.createEl('span', { text: '─', cls: 'ne-date-sep' })

    const toInput = row.createEl('input', { cls: 'ne-date-input' })
    toInput.type = 'date'
    toInput.min = defaults.from
    toInput.max = defaults.to
    toInput.value = this.filterDateTo ?? defaults.to
    toInput.dataset['testid'] = 'date-input-to'
    toInput.addEventListener('change', () => {
      this.filterDateTo = toInput.value || null
      void this.render()
    })

    const clearBtn = row.createEl('button', {
      cls: 'ne-action-btn ne-clear-btn',
      text: t('detail.filterClearAll'),
    })
    clearBtn.dataset['testid'] = 'detail-clear-filters'
    clearBtn.addEventListener('click', () => this.clearAllFilters())
  }

  private clearAllFilters() {
    this.filterTypes.clear()
    this.filterCategories.clear()
    this.filterWallets.clear()
    this.filterDateFrom = null
    this.filterDateTo = null
    this.filterSearch = ''
    void this.render()
  }

  private openFilterSheet(): void {
    const snapshot = {
      types: new Set(this.filterTypes),
      categories: new Set(this.filterCategories),
      wallets: new Set(this.filterWallets),
      dateFrom: this.filterDateFrom,
      dateTo: this.filterDateTo,
      search: this.filterSearch,
    }

    let bodyEl: HTMLElement | null = null

    const rerenderBody = () => {
      if (!bodyEl) return
      bodyEl.empty()
      this.buildFilterSheetBody(bodyEl, rerenderBody)
    }

    openFilterSheet({
      containerEl: this.containerEl,
      title: t('detail.filterTitle'),
      buildBody: (sheet) => {
        bodyEl = sheet
        this.buildFilterSheetBody(sheet, rerenderBody)
      },
      onCancel: () => {
        this.filterTypes = snapshot.types
        this.filterCategories = snapshot.categories
        this.filterWallets = snapshot.wallets
        this.filterDateFrom = snapshot.dateFrom
        this.filterDateTo = snapshot.dateTo
        this.filterSearch = snapshot.search
      },
      onDone: () => {},
      onClose: () => { void this.render() },
    })
  }

  private buildFilterSheetBody(sheet: HTMLElement, rerender: () => void): void {
    // ── Type ──
    {
      const sec = sheet.createDiv('ne-filter-section')
      sec.createDiv({ cls: 'ne-filter-label', text: t('detail.filterType') })
      const group = sec.createDiv('ne-pill-group')

      const allPill = group.createEl('button', {
        cls: 'ne-pill ne-pill-color-neutral' + (this.filterTypes.size === 0 ? ' is-active' : ''),
        text: t('detail.filterAll'),
      })
      const allHandler = () => {
        this.filterTypes.clear()
        rerender()
        this.applyFilters()
      }
      allPill.addEventListener('touchend', (e) => { e.preventDefault(); allHandler() })
      allPill.addEventListener('click', allHandler)

      const typeOptions: { value: TransactionType; label: string }[] = [
        { value: 'expense',  label: t('detail.filterExpense') },
        { value: 'income',   label: t('detail.filterIncome') },
        { value: 'transfer', label: t('detail.filterTransfer') },
      ]
      for (const opt of typeOptions) {
        const pill = group.createEl('button', {
          cls: `ne-pill ne-pill-color-${opt.value}` + (this.filterTypes.has(opt.value) ? ' is-active' : ''),
          text: opt.label,
        })
        const handler = () => {
          if (this.filterTypes.has(opt.value)) this.filterTypes.delete(opt.value)
          else this.filterTypes.add(opt.value)
          rerender()
          this.applyFilters()
        }
        pill.addEventListener('touchend', (e) => { e.preventDefault(); handler() })
        pill.addEventListener('click', handler)
      }
    }

    // ── Category (source follows the type filter) ──
    {
      const catSource = this.cachedTransactions.filter(tx => {
        if (this.filterTypes.size === 0) return tx.type === 'expense' || tx.type === 'income' || tx.type === 'transfer'
        return this.filterTypes.has(tx.type)
      })
      const allCategories = new Set<string>()
      catSource.forEach(tx => { if (tx.category) allCategories.add(tx.category) })
      // Drop selected categories that no longer exist under the current type filter
      for (const cat of this.filterCategories) {
        if (!allCategories.has(cat)) this.filterCategories.delete(cat)
      }

      if (allCategories.size > 0) {
        const sec = sheet.createDiv('ne-filter-section')
        sec.createDiv({ cls: 'ne-filter-label', text: t('detail.filterCategory') })
        const group = sec.createDiv('ne-pill-group')

        const allPill = group.createEl('button', {
          cls: 'ne-pill ne-pill-color-neutral' + (this.filterCategories.size === 0 ? ' is-active' : ''),
          text: t('detail.filterAll'),
        })
        const allHandler = () => {
          this.filterCategories.clear()
          rerender()
          this.applyFilters()
        }
        allPill.addEventListener('touchend', (e) => { e.preventDefault(); allHandler() })
        allPill.addEventListener('click', allHandler)

        for (const cat of allCategories) {
          const isSelected = this.filterCategories.has(cat)
          const pill = group.createEl('button', {
            cls: 'ne-pill ne-pill-color-neutral' + (isSelected ? ' is-active' : ''),
            text: translateCategory(cat),
          })
          const handler = () => {
            if (this.filterCategories.has(cat)) this.filterCategories.delete(cat)
            else this.filterCategories.add(cat)
            rerender()
            this.applyFilters()
          }
          pill.addEventListener('touchend', (e) => { e.preventDefault(); handler() })
          pill.addEventListener('click', handler)
        }
      }
    }

    // ── Account ──
    {
      const wallets = this.walletFile.getConfig().wallets.filter(w => w.status === 'active')
      if (wallets.length > 0) {
        const sec = sheet.createDiv('ne-filter-section')
        sec.createDiv({ cls: 'ne-filter-label', text: t('detail.filterAccount') })
        const group = sec.createDiv('ne-pill-group')

        const allPill = group.createEl('button', {
          cls: 'ne-pill ne-pill-color-neutral' + (this.filterWallets.size === 0 ? ' is-active' : ''),
          text: t('detail.filterAllAccounts'),
        })
        const allWalletHandler = () => {
          this.filterWallets.clear()
          rerender()
          this.applyFilters()
        }
        allPill.addEventListener('touchend', (e) => { e.preventDefault(); allWalletHandler() })
        allPill.addEventListener('click', allWalletHandler)

        for (const w of wallets) {
          const isSelected = this.filterWallets.has(w.name)
          const colorKey = w.type === 'creditCard' ? 'credit' : w.type
          const pill = group.createEl('button', {
            cls: `ne-pill ne-pill-color-${colorKey}` + (isSelected ? ' is-active' : ''),
            text: w.name,
          })
          const handler = () => {
            if (this.filterWallets.has(w.name)) this.filterWallets.delete(w.name)
            else this.filterWallets.add(w.name)
            rerender()
            this.applyFilters()
          }
          pill.addEventListener('touchend', (e) => { e.preventDefault(); handler() })
          pill.addEventListener('click', handler)
        }
      }
    }

    // ── Date range ──
    {
      const sec = sheet.createDiv('ne-filter-section')
      sec.createDiv({ cls: 'ne-filter-label', text: t('detail.filterDateRange') })

      const row = sec.createDiv('ne-detail-date-row')
      const defaults = this.getMonthDateDefaults()

      const fromInput = row.createEl('input', { cls: 'ne-date-input' })
      fromInput.type = 'date'
      fromInput.min = defaults.from
      fromInput.max = defaults.to
      fromInput.value = this.filterDateFrom ?? defaults.from
      fromInput.addEventListener('change', () => {
        this.filterDateFrom = fromInput.value || null
        this.applyFilters()
      })

      row.createEl('span', { text: '─', cls: 'ne-date-sep' })

      const toInput = row.createEl('input', { cls: 'ne-date-input' })
      toInput.type = 'date'
      toInput.min = defaults.from
      toInput.max = defaults.to
      toInput.value = this.filterDateTo ?? defaults.to
      toInput.addEventListener('change', () => {
        this.filterDateTo = toInput.value || null
        this.applyFilters()
      })
    }

    // Clear-all button — pinned at bottom of body
    const clearBtn = sheet.createEl('button', {
      cls: 'ne-action-btn ne-filter-clear-all',
      text: t('detail.filterClearAll'),
    })
    clearBtn.addEventListener('click', () => {
      this.filterTypes.clear()
      this.filterCategories.clear()
      this.filterWallets.clear()
      this.filterDateFrom = null
      this.filterDateTo = null
      this.filterSearch = ''
      rerender()
      this.applyFilters()
    })
  }

  private applyFilters() {
    if (!this.listEl || !this.subtotalEl) return

    const filtered = this.cachedTransactions.filter(tx => {
      if (this.filterTypes.size > 0 && !this.filterTypes.has(tx.type)) return false
      if (this.filterCategories.size > 0 && !this.filterCategories.has(tx.category ?? '')) return false
      if (this.filterWallets.size > 0
       && !this.filterWallets.has(tx.wallet ?? '')
       && !this.filterWallets.has(tx.fromWallet ?? '')
       && !this.filterWallets.has(tx.toWallet ?? '')) return false
      if (this.filterDateFrom || this.filterDateTo) {
        const txDay = tx.date.split('/')[1] ?? ''
        const txFullDate = `${this.currentYearMonth}-${txDay}`
        if (this.filterDateFrom && txFullDate < this.filterDateFrom) return false
        if (this.filterDateTo   && txFullDate > this.filterDateTo)   return false
      }
      if (this.filterSearch) {
        const q = this.filterSearch.toLowerCase()
        const matchNote = tx.note?.toLowerCase().includes(q) ?? false
        const matchTags = tx.tags?.some(tag => tag.toLowerCase().includes(q)) ?? false
        if (!matchNote && !matchTags) return false
      }
      return true
    })

    this.listEl.empty()
    if (filtered.length === 0) {
      this.listEl.createEl('p', { text: t('detail.noTransactions'), cls: 'ne-no-data' })
    } else {
      for (const tx of filtered) {
        this.renderTxRow(this.listEl, tx)
      }
    }

    let subIncome = 0, subExpense = 0
    for (const tx of filtered) {
      if (tx.type === 'income') subIncome += tx.amountCents
      if (tx.type === 'expense') subExpense += tx.amountCents
    }
    this.subtotalEl.empty()
    this.subtotalEl.createEl('span', {
      text: `${t('detail.subtotalExpense')}: ${formatCents(subExpense)}`,
      cls: 'ne-subtotal-expense',
    })
    this.subtotalEl.createEl('span', {
      text: `${t('detail.subtotalIncome')}: ${formatCents(subIncome)}`,
      cls: 'ne-subtotal-income',
    })
  }

  private renderTxRow(container: HTMLElement, tx: Transaction) {
    const row = container.createDiv('ne-tx-row')
    row.dataset['testid'] = 'tx-row'

    // col1: date (V-center, large)
    row.createEl('span', { text: tx.date, cls: 'ne-tx-date' })

    // col2: type badge (V-center)
    row.createEl('span', {
      text: t(`label.type.${tx.type}`),
      cls: `ne-type-badge ne-type-${tx.type}`,
    })

    // col3: 3-row stack — category / wallet / tags-or-note
    const stack = row.createDiv('ne-tx-row-stack')
    stack.createEl('div', {
      text: translateCategory(tx.category ?? ''),
      cls: 'ne-tx-category',
    })
    stack.createEl('div', { text: buildWalletText(tx), cls: 'ne-tx-wallet' })

    const line3 = stack.createDiv('ne-tx-row-line3')
    const display = buildLine3Display(tx)
    if (display.kind === 'tags') {
      const tagsEl = line3.createSpan('ne-tx-tags')
      for (const tag of display.tags) {
        const chip = tagsEl.createSpan({ text: `#${tag}`, cls: 'ne-tx-tag-chip' })
        chip.dataset['testid'] = 'tx-tag-chip'
        chip.dataset['tag'] = tag
      }
    } else if (display.kind === 'note') {
      line3.createEl('span', { text: display.text, cls: 'ne-tx-note' })
    } else {
      line3.createEl('span', { text: '—', cls: 'ne-tx-empty' })
    }

    // col4: amount (V-center, large)
    const amount = buildAmountDisplay(tx)
    row.createEl('span', { text: amount.text, cls: amount.className })

    row.addEventListener('click', () => {
      const ModalClass = Platform.isMobile ? MobileTransactionModal : TransactionModal
      new ModalClass(
        this.app,
        this.walletFile,
        {},
        tx,
        this.currentYearMonth,
        () => (this.app.workspace as Events).trigger('nestegg:refresh'),
        null,
      ).open()
    })
  }
}
