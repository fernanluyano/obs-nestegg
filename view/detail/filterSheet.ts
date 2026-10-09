import { t } from '../../labels'
import { openFilterSheet } from '../../modal/BottomSheetPicker'
import { dateRangeInputs, TYPE_OPTIONS } from './controls'
import type { FilterHost } from './FilterHost'
import { availableCategories, cloneFilters, emptyFilters, pruneCategories, toggle } from './filters'
import { renderPills, type PillOption } from './pills'
import type { TransactionType } from '../../domain/types'

function section(sheet: HTMLElement, label: string): HTMLElement {
  const sec = sheet.createDiv('ne-filter-section')
  sec.createDiv({ cls: 'ne-filter-label', text: label })
  return sec
}

function buildBody(sheet: HTMLElement, host: FilterHost, rerender: () => void): void {
  const change = (fn: () => void) => () => { fn(); rerender(); host.refreshList() }
  const { filters } = host

  renderPills(section(sheet, t('detail.filterType')).createDiv('ne-pill-group'), TYPE_OPTIONS(), filters.types, {
    onToggle: (v) => change(() => toggle(filters.types, v as TransactionType))(),
    onClear: change(() => filters.types.clear()),
  })

  const categories = availableCategories(host.entries, filters, host.index)
  pruneCategories(filters, categories)
  if (categories.length > 0) {
    renderPills(section(sheet, t('detail.filterCategory')).createDiv('ne-pill-group'), categories.map((c): PillOption => ({ value: c, label: c })), filters.categories, {
      onToggle: (v) => change(() => toggle(filters.categories, v))(),
      onClear: change(() => filters.categories.clear()),
    })
  }

  const accounts = host.accounts.filter(a => a.active)
  if (accounts.length > 0) {
    const options = accounts.map((a): PillOption => ({ value: a.name, label: a.name, colorKey: a.accountType === 'cash' ? 'cash' : 'credit' }))
    renderPills(section(sheet, t('detail.filterAccount')).createDiv('ne-pill-group'), options, filters.accounts, {
      onToggle: (v) => change(() => toggle(filters.accounts, v))(),
      onClear: change(() => filters.accounts.clear()),
    }, t('detail.filterAllAccounts'))
  }

  dateRangeInputs(section(sheet, t('detail.filterDateRange')).createDiv('ne-detail-date-row'), host, () => host.refreshList())

  const clear = sheet.createEl('button', { cls: 'ne-action-btn ne-filter-clear-all', text: t('detail.filterClearAll') })
  clear.addEventListener('click', change(() => { host.filters = emptyFilters() }))
}

// Mobile: filters edit live behind a sheet; cancelling restores the snapshot taken on open.
export function openDetailFilterSheet(containerEl: HTMLElement, host: FilterHost): void {
  const snapshot = cloneFilters(host.filters)
  let body: HTMLElement | null = null
  const rerender = () => {
    if (!body) return
    body.empty()
    buildBody(body, host, rerender)
  }
  openFilterSheet({
    containerEl,
    title: t('detail.filterTitle'),
    buildBody: (sheet) => { body = sheet; buildBody(sheet, host, rerender) },
    onCancel: () => { host.filters = snapshot },
    onDone: () => {},
    onClose: () => host.rerender(),
  })
}
