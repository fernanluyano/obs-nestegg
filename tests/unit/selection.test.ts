import { describe, expect, it } from 'vitest'
import type { LedgerEntry } from '../../domain/types'
import { entryKeys, pickEntries, pruneSelection, toggleAll, toggleKey } from '../../view/detail/selection'

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  account: 'Cash Main', date: '2026-10-03', merchant: 'Publix', subcategory: 'Groceries',
  amountCents: -1000, note: '', tags: [], fromTo: '', ...over,
})

describe('entryKeys', () => {
  it('gives different rows different keys', () => {
    const keys = entryKeys([entry(), entry({ amountCents: -1001 }), entry({ account: 'Savings' }), entry({ tags: ['a'] })])
    expect(new Set(keys).size).toBe(4)
  })

  it('tells identical rows apart by their order', () => {
    const [a, b, c] = entryKeys([entry(), entry(), entry({ merchant: 'Other' })])
    expect(a).not.toBe(b)
    expect(c).not.toBe(a)
  })

  it('is the same for the same list built again', () => {
    expect(entryKeys([entry(), entry()])).toEqual(entryKeys([entry(), entry()]))
  })
})

describe('selection helpers', () => {
  const rows = [entry({ merchant: 'A' }), entry({ merchant: 'B' }), entry({ merchant: 'C' })]
  const keys = entryKeys(rows)

  it('picks the selected rows in list order', () => {
    expect(pickEntries(rows, keys, new Set([keys[2], keys[0]])).map(e => e.merchant)).toEqual(['A', 'C'])
    expect(pickEntries(rows, keys, new Set())).toEqual([])
  })

  it('toggles one key without touching the original set', () => {
    const start = new Set([keys[0]])
    expect([...toggleKey(start, keys[1])]).toEqual([keys[0], keys[1]])
    expect([...toggleKey(start, keys[0])]).toEqual([])
    expect(start.size).toBe(1)
  })

  it('selects everything shown, then clears just that on the next press', () => {
    const outside = 'elsewhere'
    const all = toggleAll(new Set([outside, keys[0]]), keys)
    expect(all).toEqual(new Set([outside, ...keys]))
    expect(toggleAll(all, keys)).toEqual(new Set([outside]))
    expect(toggleAll(new Set(), [])).toEqual(new Set())
  })

  it('drops keys that are no longer in the list', () => {
    expect(pruneSelection(new Set([keys[0], 'gone']), keys)).toEqual(new Set([keys[0]]))
  })
})
