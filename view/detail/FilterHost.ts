import type { CategoryIndex } from '../../domain/categories'
import type { Account, LedgerEntry } from '../../domain/types'
import type { DetailFilters } from './filters'

// What the filter controls need from the view: the current filters and data, and two ways to react.
export interface FilterHost {
  filters: DetailFilters
  entries: LedgerEntry[]
  index: CategoryIndex
  accounts: Account[]
  yearMonth: string
  // Re-apply filters to the list without rebuilding the controls.
  refreshList(): void
  // Rebuild the whole view, for changes that alter which controls exist.
  rerender(): void
  register(cleanup: () => void): void
}
