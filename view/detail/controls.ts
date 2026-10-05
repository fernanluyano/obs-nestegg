import { Platform } from 'obsidian'
import { t } from '../../labels'
import type { TransactionType } from '../../domain/types'
import { accountDropdownLabels, categoryDropdownLabels, renderMultiDropdown } from './dropdown'
import type { FilterHost } from './FilterHost'
import { availableCategories, emptyFilters, monthDateBounds, pruneCategories, toggle } from './filters'
import { renderPills, type PillOption } from './pills'

export const TYPE_OPTIONS = (): PillOption[] => [
  { value: 'expense', label: t('detail.filterExpense'), colorKey: 'expense' },
  { value: 'income', label: t('detail.filterIncome'), colorKey: 'income' },
  { value: 'transfer', label: t('detail.filterTransfer'), colorKey: 'transfer' },
]

export function typePills(container: HTMLElement, host: FilterHost): void {
  renderPills(container, TYPE_OPTIONS(), host.filters.types, {
    onToggle: (v) => { toggle(host.filters.types, v as TransactionType); host.rerender() },
    onClear: () => { host.filters.types.clear(); host.rerender() },
  })
}

export function categoryDropdown(container: HTMLElement, host: FilterHost, panelState: { open: boolean }): void {
  const options = availableCategories(host.entries, host.filters, host.index)
  pruneCategories(host.filters, options)
  renderMultiDropdown(container, {
    ...categoryDropdownLabels(), options, selected: host.filters.categories, panelState,
    onChange: () => host.refreshList(), register: host.register,
  })
}

export function accountDropdown(container: HTMLElement, host: FilterHost, panelState: { open: boolean }): void {
  renderMultiDropdown(container, {
    ...accountDropdownLabels(),
    options: host.accounts.filter(a => a.active).map(a => a.name),
    selected: host.filters.accounts, panelState,
    onChange: () => host.refreshList(), register: host.register,
  })
}

export function dateRangeInputs(row: HTMLElement, host: FilterHost, onChange: () => void): void {
  const bounds = monthDateBounds(host.yearMonth)
  const make = (value: string, testid: string, set: (v: string | null) => void) => {
    const input = row.createEl('input', { cls: 'ne-date-input' })
    input.type = 'date'
    input.min = bounds.from
    input.max = bounds.to
    input.value = value
    input.dataset['testid'] = testid
    input.addEventListener('change', () => { set(input.value || null); onChange() })
  }
  make(host.filters.dateFrom ?? bounds.from, 'date-input-from', (v) => { host.filters.dateFrom = v })
  row.createEl('span', { text: '─', cls: 'ne-date-sep' })
  make(host.filters.dateTo ?? bounds.to, 'date-input-to', (v) => { host.filters.dateTo = v })
}

export function dateRangeRow(container: HTMLElement, host: FilterHost): void {
  const row = container.createDiv('ne-detail-date-row')
  dateRangeInputs(row, host, () => host.rerender())
  const clear = row.createEl('button', { cls: 'ne-action-btn ne-clear-btn', text: t('detail.filterClearAll') })
  clear.dataset['testid'] = 'detail-clear-filters'
  clear.addEventListener('click', () => { host.filters = emptyFilters(); host.rerender() })
}

export function searchRow(container: HTMLElement, host: FilterHost, filterButton: { count: number; onClick: () => void } | null, keyboardEl: HTMLElement): void {
  const row = container.createDiv('ne-detail-search-row')
  const input = row.createEl('input', { cls: 'ne-search-input', placeholder: t('detail.searchPlaceholder') })
  input.dataset['testid'] = 'detail-search'
  input.type = 'text'
  input.setAttribute('enterkeyhint', 'done')
  input.value = host.filters.search
  input.addEventListener('input', () => { host.filters.search = input.value; host.refreshList() })
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur() })
  if (Platform.isMobile) {
    input.addEventListener('focus', () => keyboardEl.addClass('ne-keyboard-open'))
    input.addEventListener('blur', () => keyboardEl.removeClass('ne-keyboard-open'))
  }
  if (!filterButton) return
  const label = filterButton.count > 0 ? `${t('detail.filterButton')} (${filterButton.count}) ▾` : `${t('detail.filterButton')} ▾`
  const btn = row.createEl('button', { cls: 'ne-filter-btn' + (filterButton.count > 0 ? ' is-active' : ''), text: label })
  btn.dataset['testid'] = 'detail-filter-btn'
  btn.addEventListener('click', filterButton.onClick)
}
