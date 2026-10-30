import { describe, expect, it } from 'vitest'
import type { LedgerEntry } from '../../domain/types'
import {
  accountLabels, accountSummary, amountFigure, detailLine, rowTitle, isMoneyBack, tagWarning,
} from '../../view/txRowText'

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  account: 'Cash', date: '2026-10-03', merchant: '', subcategory: 'Groceries',
  amountCents: -8450, note: '', tags: [], fromTo: '', ...over,
})

describe('isMoneyBack', () => {
  it('is money coming back under an expense', () => {
    expect(isMoneyBack(entry({ amountCents: 1200 }), 'expense')).toBe(true)
  })

  it('is not a refund for spending, income, transfers or unknown types', () => {
    expect(isMoneyBack(entry(), 'expense')).toBe(false)
    expect(isMoneyBack(entry({ amountCents: 1200 }), 'income')).toBe(false)
    expect(isMoneyBack(entry({ amountCents: 1200 }), 'transfer')).toBe(false)
    expect(isMoneyBack(entry({ amountCents: 1200 }), undefined)).toBe(false)
  })
})

describe('accountLabels', () => {
  it('lists the account alone, or both sides of a transfer in direction order', () => {
    expect(accountLabels(entry())).toEqual(['Cash'])
    expect(accountLabels(entry({ amountCents: -5000, fromTo: 'Savings' }))).toEqual(['Cash', 'Savings'])
    expect(accountLabels(entry({ amountCents: 5000, fromTo: 'Savings' }))).toEqual(['Savings', 'Cash'])
  })
})

describe('accountSummary', () => {
  it('shows the account for an ordinary row', () => {
    expect(accountSummary(entry())).toBe('Cash')
  })

  it('shows a dash when there is no account', () => {
    expect(accountSummary(entry({ account: '' }))).toBe('—')
  })

  it('shows the direction of a transfer from its sign', () => {
    expect(accountSummary(entry({ amountCents: -5000, fromTo: 'Savings' }))).toBe('Cash → Savings')
    expect(accountSummary(entry({ amountCents: 5000, fromTo: 'Savings' }))).toBe('Savings → Cash')
  })
})

describe('rowTitle', () => {
  it('is the subcategory, with the merchant when there is one', () => {
    expect(rowTitle(entry())).toBe('Groceries')
    expect(rowTitle(entry({ merchant: 'Publix' }))).toBe('Groceries · Publix')
  })
})

describe('amountFigure', () => {
  it('shows spending as a negative expense', () => {
    expect(amountFigure(entry(), 'expense')).toEqual({ text: '-84.50', className: 'ne-tx-amount is-expense' })
  })

  it('shows a refund as positive with its own style', () => {
    expect(amountFigure(entry({ amountCents: 1200 }), 'expense')).toEqual({ text: '+12.00', className: 'ne-tx-amount is-refund' })
  })

  it('shows income as positive', () => {
    expect(amountFigure(entry({ amountCents: 250000 }), 'income')).toEqual({ text: '+2,500.00', className: 'ne-tx-amount is-income' })
  })

  it('keeps the sign for transfers and unknown types with a neutral style', () => {
    expect(amountFigure(entry({ amountCents: -5000 }), 'transfer')).toEqual({ text: '-50.00', className: 'ne-tx-amount' })
    expect(amountFigure(entry({ amountCents: 5000 }), undefined)).toEqual({ text: '+50.00', className: 'ne-tx-amount' })
  })

  it('shows zero without a sign', () => {
    expect(amountFigure(entry({ amountCents: 0 }), 'expense').text).toBe('0.00')
  })
})

describe('tagWarning', () => {
  it('is null for good tags and explains the broken rule otherwise', () => {
    expect(tagWarning(entry({ tags: ['need'] }), 'expense')).toBeNull()
    expect(tagWarning(entry({ tags: ['need', 'want'] }), 'expense')).toContain('"need" or a "want"')
    expect(tagWarning(entry({ tags: ['a', 'b', 'c', 'd'] }), 'expense')).toContain('at most 3')
  })

  it('flags spending without need or want, but not refunds, income or transfers', () => {
    const spending = entry({ amountCents: -500, tags: [] })
    expect(tagWarning(spending, 'expense')).toContain('"need" or "want"')
    expect(tagWarning(entry({ amountCents: 500, tags: [] }), 'expense')).toBeNull()
    expect(tagWarning(entry({ tags: [] }), 'income')).toBeNull()
    expect(tagWarning(entry({ tags: [] }), 'transfer')).toBeNull()
    expect(tagWarning(entry({ tags: [] }), undefined)).toBeNull()
  })
})

describe('detailLine', () => {
  it('prefers tags, then the note, then nothing', () => {
    expect(detailLine(entry({ tags: ['a'], note: 'n' }))).toEqual({ kind: 'tags', tags: ['a'] })
    expect(detailLine(entry({ note: '  n  ' }))).toEqual({ kind: 'note', text: 'n' })
    expect(detailLine(entry({ note: '   ' }))).toEqual({ kind: 'empty' })
    expect(detailLine(entry())).toEqual({ kind: 'empty' })
  })
})
