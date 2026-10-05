import { describe, it, expect } from 'vitest'
import { parseAmountForEdit, getCategoryOptions, addTagToList, validateTransactionForm, getTransferWalletCandidates, type TransactionFormState } from '../../modal/transactionState'
import type { NesteggConfig, Wallet } from '../../types'

describe('parseAmountForEdit', () => {
  it('positive cents → decimal display + isRefund=false', () => {
    expect(parseAmountForEdit(10000)).toEqual({ display: '100.00', isRefund: false })
  })

  it('negative cents → absolute display + isRefund=true', () => {
    expect(parseAmountForEdit(-10000)).toEqual({ display: '100.00', isRefund: true })
  })

  it('zero → display="0.00", isRefund=false', () => {
    expect(parseAmountForEdit(0)).toEqual({ display: '0.00', isRefund: false })
  })

  it('fractional cents keep two decimals', () => {
    expect(parseAmountForEdit(1250)).toEqual({ display: '12.50', isRefund: false })
    expect(parseAmountForEdit(7)).toEqual({ display: '0.07', isRefund: false })
  })

  it('negative fractional → absolute display + isRefund=true', () => {
    expect(parseAmountForEdit(-1250)).toEqual({ display: '12.50', isRefund: true })
  })
})

describe('getCategoryOptions', () => {
  const baseConfig = {
    wallets: [],
    defaultWallet: '',
    tags: [],
    options: {
      categories: {
        expense: { default: ['food', 'transport'], custom: ['gift'] },
        income: { default: ['salary'], custom: [] },
        transfer: { default: ['credit_card_payment'], custom: ['custom_xfer'] },
      },
    },
  } as unknown as NesteggConfig

  it('expense type → default keys + custom values', () => {
    const result = getCategoryOptions(baseConfig, 'expense')
    expect(result.map(r => r.key)).toEqual(['food', 'transport', 'gift'])
    expect(result.find(r => r.key === 'gift')?.label).toBe('gift')
  })

  it('income type → only default keys + empty custom', () => {
    const result = getCategoryOptions(baseConfig, 'income')
    expect(result.map(r => r.key)).toEqual(['salary'])
  })

  it('transfer type → returns transfer categories', () => {
    const result = getCategoryOptions(baseConfig, 'transfer')
    expect(result.map(r => r.key)).toEqual(['credit_card_payment', 'custom_xfer'])
  })

  it('empty default + non-empty custom → only custom', () => {
    const cfg = { ...baseConfig,
      options: { categories: {
        expense: { default: [], custom: ['only_custom'] },
        income: { default: [], custom: [] },
        transfer: { default: [], custom: [] },
      } },
    } as unknown as NesteggConfig
    const result = getCategoryOptions(cfg, 'expense')
    expect(result.map(r => r.key)).toEqual(['only_custom'])
  })
})

describe('addTagToList', () => {
  it('empty input → kind=empty, list unchanged', () => {
    const result = addTagToList(['a'], '')
    expect(result).toEqual({ kind: 'empty' })
  })

  it('whitespace-only input → kind=empty', () => {
    expect(addTagToList(['a'], '   ')).toEqual({ kind: 'empty' })
  })

  it('# prefix stripped before processing', () => {
    const result = addTagToList(['a'], '#foo')
    expect(result).toEqual({ kind: 'added', next: ['a', 'foo'] })
  })

  it('whitespace trimmed', () => {
    const result = addTagToList([], '  bar  ')
    expect(result).toEqual({ kind: 'added', next: ['bar'] })
  })

  it('invalid tag (contains comma) → kind=invalid', () => {
    const result = addTagToList([], 'foo,bar')
    expect(result.kind).toBe('invalid')
  })

  it('duplicate → kind=duplicate, list unchanged', () => {
    const result = addTagToList(['foo'], 'foo')
    expect(result).toEqual({ kind: 'duplicate' })
  })

  it('at max 3 → kind=max, list unchanged', () => {
    const result = addTagToList(['a', 'b', 'c'], 'd')
    expect(result).toEqual({ kind: 'max' })
  })

  it('valid new tag → kind=added with next list', () => {
    const result = addTagToList(['a'], 'b')
    expect(result).toEqual({ kind: 'added', next: ['a', 'b'] })
  })
})

describe('validateTransactionForm', () => {
  const validExpenseState: TransactionFormState = {
    date: '2026-05-03',
    type: 'expense',
    wallet: 'cash',
    fromWallet: '',
    toWallet: '',
    category: 'food',
    note: '',
    tags: [],
    amount: '100',
    isRefund: false,
  }

  const config: NesteggConfig = {
    wallets: [
      { name: 'cash', type: 'cash', status: 'active', initialBalanceCents: 0, includeInNetAsset: true },
      { name: 'visa', type: 'creditCard', status: 'active', initialBalanceCents: 0, includeInNetAsset: true },
      { name: 'bank', type: 'bank', status: 'active', initialBalanceCents: 0, includeInNetAsset: true },
    ],
    defaultWallet: 'cash',
    tags: [],
    folderName: 'Nestegg',
    autoValidateOnLoad: true,
    options: {} as never,
  } as NesteggConfig

  it('valid expense → ok', () => {
    expect(validateTransactionForm(validExpenseState, config)).toEqual({ ok: true })
  })

  it('invalid date format → invalidDate', () => {
    const s = { ...validExpenseState, date: '2026/5/3' }
    expect(validateTransactionForm(s, config)).toEqual({ ok: false, errorKey: 'err.invalidDate' })
  })

  it('empty amount → amountRequired', () => {
    const s = { ...validExpenseState, amount: '' }
    expect(validateTransactionForm(s, config)).toEqual({ ok: false, errorKey: 'err.amountRequired' })
  })

  it('non-numeric amount → amountInvalid', () => {
    const s = { ...validExpenseState, amount: 'abc' }
    expect(validateTransactionForm(s, config)).toEqual({ ok: false, errorKey: 'err.amountInvalid' })
  })

  it('zero amount → amountPositive', () => {
    const s = { ...validExpenseState, amount: '0' }
    expect(validateTransactionForm(s, config)).toEqual({ ok: false, errorKey: 'err.amountPositive' })
  })

  it('negative amount → amountPositive', () => {
    const s = { ...validExpenseState, amount: '-5' }
    expect(validateTransactionForm(s, config)).toEqual({ ok: false, errorKey: 'err.amountPositive' })
  })

  it('more than 2 decimals → amountInvalid', () => {
    const s = { ...validExpenseState, amount: '12.345' }
    expect(validateTransactionForm(s, config)).toEqual({ ok: false, errorKey: 'err.amountInvalid' })
  })

  it('1–2 decimals → ok', () => {
    expect(validateTransactionForm({ ...validExpenseState, amount: '12.5' }, config)).toEqual({ ok: true })
    expect(validateTransactionForm({ ...validExpenseState, amount: '12.50' }, config)).toEqual({ ok: true })
  })

  it('expense missing wallet → walletRequired', () => {
    const s = { ...validExpenseState, wallet: '' }
    expect(validateTransactionForm(s, config)).toEqual({ ok: false, errorKey: 'err.walletRequired' })
  })

  it('income missing wallet → walletRequired', () => {
    const s = { ...validExpenseState, type: 'income' as const, wallet: '' }
    expect(validateTransactionForm(s, config)).toEqual({ ok: false, errorKey: 'err.walletRequired' })
  })

  it('transfer missing fromWallet → fromWalletRequired', () => {
    const s: TransactionFormState = {
      ...validExpenseState,
      type: 'transfer',
      wallet: '',
      fromWallet: '',
      toWallet: 'bank',
    }
    expect(validateTransactionForm(s, config)).toEqual({ ok: false, errorKey: 'err.fromWalletRequired' })
  })

  it('transfer missing toWallet → toWalletRequired', () => {
    const s: TransactionFormState = {
      ...validExpenseState,
      type: 'transfer',
      wallet: '',
      fromWallet: 'cash',
      toWallet: '',
    }
    expect(validateTransactionForm(s, config)).toEqual({ ok: false, errorKey: 'err.toWalletRequired' })
  })

  it('cc_payment from creditCard → fromMustNotBeCreditCard', () => {
    const s: TransactionFormState = {
      ...validExpenseState,
      type: 'transfer',
      wallet: '',
      fromWallet: 'visa',
      toWallet: 'visa',
      category: 'credit_card_payment',
    }
    expect(validateTransactionForm(s, config)).toEqual({ ok: false, errorKey: 'err.fromMustNotBeCreditCard' })
  })

  it('cc_payment to non-creditCard → toMustBeCreditCard', () => {
    const s: TransactionFormState = {
      ...validExpenseState,
      type: 'transfer',
      wallet: '',
      fromWallet: 'cash',
      toWallet: 'bank',
      category: 'credit_card_payment',
    }
    expect(validateTransactionForm(s, config)).toEqual({ ok: false, errorKey: 'err.toMustBeCreditCard' })
  })

  it('transfer same wallet → sameWallet', () => {
    const s: TransactionFormState = {
      ...validExpenseState,
      type: 'transfer',
      wallet: '',
      fromWallet: 'cash',
      toWallet: 'cash',
    }
    expect(validateTransactionForm(s, config)).toEqual({ ok: false, errorKey: 'err.sameWallet' })
  })
})

import { buildTransactionPayload } from '../../modal/transactionState'

describe('buildTransactionPayload', () => {
  const baseState: TransactionFormState = {
    date: '2026-05-03',
    type: 'expense',
    wallet: 'cash',
    fromWallet: '',
    toWallet: '',
    category: 'food',
    note: 'lunch',
    tags: [],
    amount: '100',
    isRefund: false,
  }

  it('expense → wallet set, fromWallet/toWallet undefined', () => {
    const tx = buildTransactionPayload(baseState)
    expect(tx.wallet).toBe('cash')
    expect(tx.fromWallet).toBeUndefined()
    expect(tx.toWallet).toBeUndefined()
    expect(tx.amountCents).toBe(10000)
    expect(tx.category).toBe('food')
    expect(tx.tags).toBeUndefined()
  })

  it('income → wallet set, fromWallet/toWallet undefined', () => {
    const tx = buildTransactionPayload({ ...baseState, type: 'income' })
    expect(tx.wallet).toBe('cash')
    expect(tx.fromWallet).toBeUndefined()
    expect(tx.toWallet).toBeUndefined()
  })

  it('transfer → fromWallet/toWallet set, wallet undefined', () => {
    const tx = buildTransactionPayload({
      ...baseState,
      type: 'transfer',
      wallet: '',
      fromWallet: 'cash',
      toWallet: 'bank',
    })
    expect(tx.wallet).toBeUndefined()
    expect(tx.fromWallet).toBe('cash')
    expect(tx.toWallet).toBe('bank')
  })

  it('refund → amount negative', () => {
    const tx = buildTransactionPayload({ ...baseState, isRefund: true })
    expect(tx.amountCents).toBe(-10000)
  })

  it('empty category → undefined', () => {
    const tx = buildTransactionPayload({ ...baseState, category: '' })
    expect(tx.category).toBeUndefined()
  })

  it('non-empty tags → preserved', () => {
    const tx = buildTransactionPayload({ ...baseState, tags: ['#food'] })
    expect(tx.tags).toEqual(['#food'])
  })

  it('date formatted to MM/DD via dateToMonthDay', () => {
    const tx = buildTransactionPayload(baseState)
    expect(tx.date).toBe('05/03')
  })

  it('decimal amount converted to exact cents', () => {
    expect(buildTransactionPayload({ ...baseState, amount: '12.5' }).amountCents).toBe(1250)
    expect(buildTransactionPayload({ ...baseState, amount: '1.15' }).amountCents).toBe(115)
  })
})

describe('getTransferWalletCandidates', () => {
  const wallets: Wallet[] = [
    { name: 'cash', type: 'cash', status: 'active', initialBalanceCents: 0, includeInNetAsset: true },
    { name: 'bank', type: 'bank', status: 'active', initialBalanceCents: 0, includeInNetAsset: true },
    { name: 'visa', type: 'creditCard', status: 'active', initialBalanceCents: 0, includeInNetAsset: true },
    { name: 'mc', type: 'creditCard', status: 'active', initialBalanceCents: 0, includeInNetAsset: true },
  ]

  it('cc_payment → from excludes creditCard, to only creditCard', () => {
    const { fromCandidates, toCandidates } = getTransferWalletCandidates(wallets, 'credit_card_payment')
    expect(fromCandidates.map(w => w.name)).toEqual(['cash', 'bank'])
    expect(toCandidates.map(w => w.name)).toEqual(['visa', 'mc'])
  })

  it('non-cc_payment category → from = to = all wallets', () => {
    const { fromCandidates, toCandidates } = getTransferWalletCandidates(wallets, 'other')
    expect(fromCandidates).toEqual(wallets)
    expect(toCandidates).toEqual(wallets)
  })

  it('empty wallets → empty candidates', () => {
    const { fromCandidates, toCandidates } = getTransferWalletCandidates([], 'credit_card_payment')
    expect(fromCandidates).toEqual([])
    expect(toCandidates).toEqual([])
  })

  it('cc_payment with only creditCards → empty from, all in to', () => {
    const cards = wallets.filter(w => w.type === 'creditCard')
    const { fromCandidates, toCandidates } = getTransferWalletCandidates(cards, 'credit_card_payment')
    expect(fromCandidates).toEqual([])
    expect(toCandidates.map(w => w.name)).toEqual(['visa', 'mc'])
  })

  it('cc_payment with no creditCards → all in from, empty to', () => {
    const noCards = wallets.filter(w => w.type !== 'creditCard')
    const { fromCandidates, toCandidates } = getTransferWalletCandidates(noCards, 'credit_card_payment')
    expect(fromCandidates.map(w => w.name)).toEqual(['cash', 'bank'])
    expect(toCandidates).toEqual([])
  })

  it('empty category string → treated as non-cc_payment', () => {
    const { fromCandidates, toCandidates } = getTransferWalletCandidates(wallets, '')
    expect(fromCandidates).toEqual(wallets)
    expect(toCandidates).toEqual(wallets)
  })
})
