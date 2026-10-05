import { describe, expect, it } from 'vitest'
import type { LedgerEntry } from '../../domain/types'
import {
  buildAccountText, buildAmountDisplay, buildLine3Display, buildTitleText, isRefund,
} from '../../view/detailRow'

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  account: 'Cash', date: '2026-10-03', merchant: '', subcategory: 'Groceries',
  amountCents: -8450, note: '', tags: [], fromTo: '', ...over,
})

describe('isRefund', () => {
  it('is money coming back under an expense', () => {
    expect(isRefund(entry({ amountCents: 1200 }), 'expense')).toBe(true)
  })

  it('is not a refund for spending, income, transfers or unknown types', () => {
    expect(isRefund(entry(), 'expense')).toBe(false)
    expect(isRefund(entry({ amountCents: 1200 }), 'income')).toBe(false)
    expect(isRefund(entry({ amountCents: 1200 }), 'transfer')).toBe(false)
    expect(isRefund(entry({ amountCents: 1200 }), undefined)).toBe(false)
  })
})

describe('buildAccountText', () => {
  it('shows the account for an ordinary row', () => {
    expect(buildAccountText(entry())).toBe('Cash')
  })

  it('shows a dash when there is no account', () => {
    expect(buildAccountText(entry({ account: '' }))).toBe('—')
  })

  it('shows the direction of a transfer from its sign', () => {
    expect(buildAccountText(entry({ amountCents: -5000, fromTo: 'Savings' }))).toBe('Cash → Savings')
    expect(buildAccountText(entry({ amountCents: 5000, fromTo: 'Savings' }))).toBe('Savings → Cash')
  })
})

describe('buildTitleText', () => {
  it('is the subcategory, with the merchant when there is one', () => {
    expect(buildTitleText(entry())).toBe('Groceries')
    expect(buildTitleText(entry({ merchant: 'Publix' }))).toBe('Groceries · Publix')
  })
})

describe('buildAmountDisplay', () => {
  it('shows spending as a negative expense', () => {
    expect(buildAmountDisplay(entry(), 'expense')).toEqual({ text: '-84.50', className: 'ne-tx-amount is-expense' })
  })

  it('shows a refund as positive with its own style', () => {
    expect(buildAmountDisplay(entry({ amountCents: 1200 }), 'expense')).toEqual({ text: '+12.00', className: 'ne-tx-amount is-refund' })
  })

  it('shows income as positive', () => {
    expect(buildAmountDisplay(entry({ amountCents: 250000 }), 'income')).toEqual({ text: '+2,500.00', className: 'ne-tx-amount is-income' })
  })

  it('keeps the sign for transfers and unknown types with a neutral style', () => {
    expect(buildAmountDisplay(entry({ amountCents: -5000 }), 'transfer')).toEqual({ text: '-50.00', className: 'ne-tx-amount' })
    expect(buildAmountDisplay(entry({ amountCents: 5000 }), undefined)).toEqual({ text: '+50.00', className: 'ne-tx-amount' })
  })

  it('shows zero without a sign', () => {
    expect(buildAmountDisplay(entry({ amountCents: 0 }), 'expense').text).toBe('0.00')
  })
})

describe('buildLine3Display', () => {
  it('prefers tags, then the note, then nothing', () => {
    expect(buildLine3Display(entry({ tags: ['a'], note: 'n' }))).toEqual({ kind: 'tags', tags: ['a'] })
    expect(buildLine3Display(entry({ note: '  n  ' }))).toEqual({ kind: 'note', text: 'n' })
    expect(buildLine3Display(entry({ note: '   ' }))).toEqual({ kind: 'empty' })
    expect(buildLine3Display(entry())).toEqual({ kind: 'empty' })
  })
})
