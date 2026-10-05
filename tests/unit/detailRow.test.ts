import { describe, it, expect } from 'vitest'
import {
  isRefund,
  buildWalletText,
  buildAmountDisplay,
  buildLine3Display,
} from '../../view/detailRow'
import type { Transaction } from '../../types'

const base: Transaction = {
  date: '05/05',
  type: 'expense',
  wallet: 'Checking',
  category: 'food',
  note: '',
  amountCents: 33000,
}

describe('isRefund', () => {
  it('expense with negative amount → refund', () => {
    expect(isRefund({ ...base, amountCents: -138000 })).toBe(true)
  })
  it('expense with positive amount → not refund', () => {
    expect(isRefund({ ...base, amountCents: 33000 })).toBe(false)
  })
  it('income with negative amount → not refund', () => {
    expect(isRefund({ ...base, type: 'income', amountCents: -100 })).toBe(false)
  })
})

describe('buildWalletText', () => {
  it('returns wallet for expense / income', () => {
    expect(buildWalletText({ ...base, wallet: 'Checking' })).toBe('Checking')
  })
  it('returns "from → to" for transfer', () => {
    expect(buildWalletText({
      ...base, type: 'transfer', wallet: undefined,
      fromWallet: 'Savings', toWallet: 'Checking',
    })).toBe('Savings → Checking')
  })
  it('returns em-dash when nothing available', () => {
    expect(buildWalletText({
      ...base, wallet: undefined, fromWallet: undefined, toWallet: undefined,
    })).toBe('—')
  })
})

describe('buildAmountDisplay', () => {
  it('expense: prefix "-" + is-expense', () => {
    const r = buildAmountDisplay({ ...base, type: 'expense', amountCents: 33000 })
    expect(r).toEqual({ text: '-330.00', className: 'ne-tx-amount is-expense' })
  })
  it('income: prefix "+" + is-income', () => {
    const r = buildAmountDisplay({ ...base, type: 'income', amountCents: 103500 })
    expect(r).toEqual({ text: '+1,035.00', className: 'ne-tx-amount is-income' })
  })
  it('refund (expense + negative): prefix "+" + is-refund + abs amount', () => {
    const r = buildAmountDisplay({ ...base, type: 'expense', amountCents: -138000 })
    expect(r).toEqual({ text: '+1,380.00', className: 'ne-tx-amount is-refund' })
  })
  it('transfer: no prefix + plain class', () => {
    const r = buildAmountDisplay({
      ...base, type: 'transfer', wallet: undefined,
      fromWallet: 'A', toWallet: 'B', amountCents: 5000000,
    })
    expect(r).toEqual({ text: '50,000.00', className: 'ne-tx-amount' })
  })
  it('keeps cents', () => {
    expect(buildAmountDisplay({ ...base, amountCents: 1250 }).text).toBe('-12.50')
    expect(buildAmountDisplay({ ...base, amountCents: 5 }).text).toBe('-0.05')
  })
})

describe('buildLine3Display', () => {
  it('tags present → kind tags', () => {
    const tx = { ...base, tags: ['dinner', '7-11'], note: '' }
    expect(buildLine3Display(tx)).toEqual({ kind: 'tags', tags: ['dinner', '7-11'] })
  })
  it('tags + note → tags wins', () => {
    const tx = { ...base, tags: ['dinner'], note: 'a note' }
    expect(buildLine3Display(tx)).toEqual({ kind: 'tags', tags: ['dinner'] })
  })
  it('no tags + note present → kind note (trimmed)', () => {
    const tx = { ...base, tags: [], note: '  dumplings  ' }
    expect(buildLine3Display(tx)).toEqual({ kind: 'note', text: 'dumplings' })
  })
  it('whitespace-only note + no tags → kind empty', () => {
    const tx = { ...base, tags: [], note: '   ' }
    expect(buildLine3Display(tx)).toEqual({ kind: 'empty' })
  })
  it('empty note + no tags → kind empty', () => {
    const tx = { ...base, tags: [], note: '' }
    expect(buildLine3Display(tx)).toEqual({ kind: 'empty' })
  })
  it('undefined tags + empty note → kind empty', () => {
    const tx = { ...base, tags: undefined, note: '' }
    expect(buildLine3Display(tx as Transaction)).toEqual({ kind: 'empty' })
  })
})
