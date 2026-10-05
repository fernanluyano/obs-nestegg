import type { CategoryIndex } from '../../domain/categories'
import { summarize } from '../../domain/transactions'
import type { LedgerEntry, MonthSummary, TransactionType } from '../../domain/types'

// Empty sets mean "all".
export interface DetailFilters {
  types: Set<TransactionType>
  categories: Set<string>
  accounts: Set<string>
  dateFrom: string | null // YYYY-MM-DD; null = no lower bound
  dateTo: string | null   // YYYY-MM-DD; null = no upper bound
  search: string
}

export function emptyFilters(): DetailFilters {
  return { types: new Set(), categories: new Set(), accounts: new Set(), dateFrom: null, dateTo: null, search: '' }
}

export function cloneFilters(f: DetailFilters): DetailFilters {
  return { ...f, types: new Set(f.types), categories: new Set(f.categories), accounts: new Set(f.accounts) }
}

export function countActiveFilters(f: DetailFilters): number {
  return [f.types.size > 0, f.categories.size > 0, f.accounts.size > 0, f.dateFrom !== null, f.dateTo !== null, f.search !== '']
    .filter(Boolean).length
}

function matchesSearch(entry: LedgerEntry, search: string): boolean {
  const q = search.toLowerCase()
  return entry.merchant.toLowerCase().includes(q)
    || entry.note.toLowerCase().includes(q)
    || entry.tags.some(tag => tag.toLowerCase().includes(q))
}

export function applyFilters(entries: LedgerEntry[], f: DetailFilters, index: CategoryIndex): LedgerEntry[] {
  return entries.filter(entry => {
    const type = index.typeOf(entry.subcategory)
    if (f.types.size > 0 && (!type || !f.types.has(type))) return false
    if (f.categories.size > 0 && !f.categories.has(index.categoryOf(entry.subcategory)?.name ?? '')) return false
    if (f.accounts.size > 0 && !f.accounts.has(entry.account) && !f.accounts.has(entry.fromTo)) return false
    if (f.dateFrom && entry.date < f.dateFrom) return false
    if (f.dateTo && entry.date > f.dateTo) return false
    if (f.search && !matchesSearch(entry, f.search)) return false
    return true
  })
}

// Categories present in the month under the current type filter, in first-seen order.
export function availableCategories(entries: LedgerEntry[], f: DetailFilters, index: CategoryIndex): string[] {
  const names = new Set<string>()
  for (const entry of entries) {
    const category = index.categoryOf(entry.subcategory)
    if (!category) continue
    if (f.types.size > 0 && !f.types.has(category.categoryType)) continue
    names.add(category.name)
  }
  return [...names]
}

// Drops selected categories that the type filter has made unavailable.
export function pruneCategories(f: DetailFilters, available: string[]): void {
  for (const name of [...f.categories]) if (!available.includes(name)) f.categories.delete(name)
}

// Newest day first; within a day the row added last comes first, since new rows are appended.
export function sortForDisplay(entries: LedgerEntry[]): LedgerEntry[] {
  return entries
    .map((entry, position) => ({ entry, position }))
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date) || b.position - a.position)
    .map(x => x.entry)
}

export function subtotals(entries: LedgerEntry[], index: CategoryIndex): MonthSummary {
  return summarize(entries, index)
}

export function monthDateBounds(yearMonth: string): { from: string; to: string } {
  const [y, m] = yearMonth.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${yearMonth}-01`, to: `${yearMonth}-${String(last).padStart(2, '0')}` }
}

export function toggle<T>(set: Set<T>, value: T): void {
  if (set.has(value)) set.delete(value)
  else set.add(value)
}
