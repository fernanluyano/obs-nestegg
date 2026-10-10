import { describe, expect, it } from 'vitest'
import { buildCategoryIndex } from '../../domain/categories'
import { defaultCategories } from '../../domain/defaults'
import type { LedgerEntry } from '../../domain/types'
import {
  applyFilters, availableCategories, cloneFilters, countActiveFilters, emptyFilters, monthDateBounds,
  pruneCategories, sortForDisplay, subtotals, toggle,
} from '../../view/detail/filters'

const index = buildCategoryIndex(defaultCategories())
const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  account: 'Cash', date: '2026-10-03', merchant: '', subcategory: 'Groceries',
  amountCents: -100, note: '', tags: [], fromTo: '', ...over,
})

const rows = [
  entry({ merchant: 'Publix', tags: ['weekly'], date: '2026-10-01' }),
  entry({ subcategory: 'Salary', amountCents: 5000, merchant: 'Employer', date: '2026-10-05' }),
  entry({ subcategory: 'Account transfer', amountCents: -2000, fromTo: 'Savings', date: '2026-10-07' }),
  entry({ account: 'Savings', subcategory: 'Account transfer', amountCents: 2000, fromTo: 'Cash', date: '2026-10-07' }),
  entry({ subcategory: 'Nope', note: 'Mystery', date: '2026-10-09' }),
]

describe('emptyFilters / countActiveFilters / cloneFilters', () => {
  it('starts with nothing active', () => {
    expect(countActiveFilters(emptyFilters())).toBe(0)
  })

  it('counts each kind of filter once', () => {
    const f = emptyFilters()
    f.types.add('expense'); f.types.add('income')
    f.categories.add('Food')
    f.accounts.add('Cash')
    f.dateFrom = '2026-10-01'
    f.dateTo = '2026-10-31'
    f.search = 'x'
    f.untagged = true
    expect(countActiveFilters(f)).toBe(7)
  })

  it('clones the sets', () => {
    const f = emptyFilters()
    const copy = cloneFilters(f)
    copy.types.add('expense')
    expect(f.types.size).toBe(0)
  })
})

describe('applyFilters', () => {
  const apply = (patch: Partial<ReturnType<typeof emptyFilters>>) => applyFilters(rows, { ...emptyFilters(), ...patch }, index)

  it('keeps everything with no filters', () => {
    expect(apply({})).toHaveLength(5)
  })

  it('filters by type, derived from the subcategory', () => {
    expect(apply({ types: new Set(['income'] as const) })).toHaveLength(1)
    expect(apply({ types: new Set(['transfer'] as const) })).toHaveLength(2)
    expect(apply({ types: new Set(['expense'] as const) })).toHaveLength(1)
  })

  it('filters by category name, with unknown subcategories matching none', () => {
    expect(apply({ categories: new Set(['Food']) })).toHaveLength(1)
    expect(apply({ categories: new Set(['Income', 'Transfers']) })).toHaveLength(3)
  })

  it('keeps only transactions without tags', () => {
    expect(apply({ untagged: true })).toHaveLength(4)
    expect(apply({ untagged: true }).some(e => e.tags.length > 0)).toBe(false)
  })

  it('filters by account, matching a transfer from either side', () => {
    expect(apply({ accounts: new Set(['Savings']) }).map(e => e.account)).toEqual(['Cash', 'Savings'])
    expect(apply({ accounts: new Set(['Cash']) })).toHaveLength(5)
  })

  it('filters by an inclusive date range', () => {
    expect(apply({ dateFrom: '2026-10-05', dateTo: '2026-10-07' })).toHaveLength(3)
    expect(apply({ dateFrom: '2026-10-08' })).toHaveLength(1)
    expect(apply({ dateTo: '2026-10-01' })).toHaveLength(1)
  })

  it('searches merchant, note and tags, ignoring case', () => {
    expect(apply({ search: 'PUBLIX' })).toHaveLength(1)
    expect(apply({ search: 'mystery' })).toHaveLength(1)
    expect(apply({ search: 'week' })).toHaveLength(1)
    expect(apply({ search: 'zzz' })).toHaveLength(0)
  })

  it('combines filters', () => {
    expect(apply({ types: new Set(['expense'] as const), search: 'publix', accounts: new Set(['Cash']) })).toHaveLength(1)
    expect(apply({ types: new Set(['income'] as const), search: 'publix' })).toHaveLength(0)
  })
})

describe('availableCategories / pruneCategories', () => {
  it('lists categories in the month, narrowed by the type filter', () => {
    expect(availableCategories(rows, emptyFilters(), index)).toEqual(['Food', 'Income', 'Transfers'])
    expect(availableCategories(rows, { ...emptyFilters(), types: new Set(['income'] as const) }, index)).toEqual(['Income'])
  })

  it('drops selections that are no longer available', () => {
    const f = { ...emptyFilters(), categories: new Set(['Food', 'Income']) }
    pruneCategories(f, ['Income'])
    expect([...f.categories]).toEqual(['Income'])
  })
})

describe('sortForDisplay', () => {
  it('puts the newest day first and the last-added row first within a day', () => {
    const sorted = sortForDisplay([
      entry({ date: '2026-10-02', note: 'a' }),
      entry({ date: '2026-10-03', note: 'b' }),
      entry({ date: '2026-10-03', note: 'c' }),
    ])
    expect(sorted.map(e => e.note)).toEqual(['c', 'b', 'a'])
  })

  it('does not change the input', () => {
    const input = [entry({ date: '2026-10-01' }), entry({ date: '2026-10-02' })]
    sortForDisplay(input)
    expect(input[0].date).toBe('2026-10-01')
  })
})

describe('subtotals / monthDateBounds / toggle', () => {
  it('summarizes the filtered rows', () => {
    expect(subtotals(rows, index)).toEqual({ incomeCents: 5000, expenseCents: 100 })
  })

  it('gives the first and last day of a month', () => {
    expect(monthDateBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthDateBounds('2028-02').to).toBe('2028-02-29')
    expect(monthDateBounds('2026-10').to).toBe('2026-10-31')
  })

  it('toggles membership', () => {
    const set = new Set(['a'])
    toggle(set, 'b')
    expect([...set]).toEqual(['a', 'b'])
    toggle(set, 'a')
    expect([...set]).toEqual(['b'])
  })
})
