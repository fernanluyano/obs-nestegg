import { describe, expect, it } from 'vitest'
import { buildCategoryIndex } from '../../domain/categories'
import { CREDIT_CARD_PAYMENT, defaultCategories } from '../../domain/defaults'
import type { Account, LedgerEntry } from '../../domain/types'
import {
  accountChoices, activeAccounts, addTagToList, buildDraft, categoryChoices, formFromEntry, initialFormState,
  normalizeAccountsForSubcategory, pendingTagProblem, resetFormForType, transferAccountCandidates, validateTransactionForm,
  type FormContext, type TransactionFormState,
} from '../../modal/transactionState'
import { account } from '../helpers/fixtures'

const accounts: Account[] = [
  account(),
  account({ name: 'Savings' }),
  account({ name: 'Card', accountType: 'creditCard' }),
  account({ name: 'Old', active: false }),
]
const categories = defaultCategories()
const ctx: FormContext = { accounts, categories, index: buildCategoryIndex(categories), defaultAccount: 'Cash Main' }

const form = (over: Partial<TransactionFormState> = {}): TransactionFormState => ({
  date: '2026-05-03', type: 'expense', account: 'Cash Main', fromAccount: '', toAccount: '',
  subcategory: 'Groceries', merchant: '', note: '', tags: [], amount: '12.50', isRefund: false, ...over,
})

const transferForm = (over: Partial<TransactionFormState> = {}) =>
  form({ type: 'transfer', account: '', fromAccount: 'Cash Main', toAccount: 'Savings', subcategory: 'Account transfer', ...over })

describe('initialFormState', () => {
  it('defaults to an expense dated today on the default account', () => {
    expect(initialFormState({}, '2026-10-04', ctx)).toEqual({
      date: '2026-10-04', type: 'expense', account: 'Cash Main', fromAccount: '', toAccount: '',
      subcategory: '', merchant: '', note: '', tags: [], amount: '', isRefund: false,
    })
  })

  it('falls back to the first active account when the default is missing or archived', () => {
    expect(initialFormState({}, 't', { ...ctx, defaultAccount: 'Old' }).account).toBe('Cash Main')
    expect(initialFormState({}, 't', { ...ctx, defaultAccount: 'Nope' }).account).toBe('Cash Main')
    expect(initialFormState({}, 't', { ...ctx, accounts: [] }).account).toBe('')
  })

  it('takes every provided parameter, copying the tags', () => {
    const tags = ['a']
    const state = initialFormState({
      type: 'income', amountCents: 1250, note: 'n', tags, subcategory: 'Salary', merchant: 'Employer',
      account: 'Savings', fromAccount: 'f', toAccount: 't', date: '2026-01-02',
    }, 'ignored', ctx)
    expect(state).toMatchObject({
      type: 'income', amount: '12.50', note: 'n', subcategory: 'Salary', merchant: 'Employer',
      account: 'Savings', fromAccount: 'f', toAccount: 't', date: '2026-01-02',
    })
    expect(state.tags).toEqual(['a'])
    expect(state.tags).not.toBe(tags)
  })
})

describe('formFromEntry', () => {
  const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
    account: 'Cash Main', date: '2026-10-03', merchant: 'Publix', subcategory: 'Groceries',
    amountCents: -8450, note: 'n', tags: ['x'], fromTo: '', ...over,
  })

  it('shows an expense as a positive amount', () => {
    expect(formFromEntry(entry(), ctx.index)).toMatchObject({ type: 'expense', account: 'Cash Main', amount: '84.50', isRefund: false, merchant: 'Publix' })
  })

  it('marks money coming back under an expense as a refund', () => {
    expect(formFromEntry(entry({ amountCents: 1200 }), ctx.index)).toMatchObject({ type: 'expense', amount: '12.00', isRefund: true })
  })

  it('reads income from the subcategory', () => {
    expect(formFromEntry(entry({ subcategory: 'Salary', amountCents: 5000 }), ctx.index)).toMatchObject({ type: 'income', amount: '50.00', isRefund: false })
  })

  it('falls back to expense for an unknown subcategory', () => {
    expect(formFromEntry(entry({ subcategory: 'Nope' }), ctx.index).type).toBe('expense')
  })

  it('reads the direction of a transfer from its sign', () => {
    const sent = formFromEntry(entry({ subcategory: 'Account transfer', amountCents: -5000, fromTo: 'Savings' }), ctx.index)
    expect(sent).toMatchObject({ type: 'transfer', account: '', fromAccount: 'Cash Main', toAccount: 'Savings', amount: '50.00', isRefund: false })
    const received = formFromEntry(entry({ account: 'Savings', subcategory: 'Account transfer', amountCents: 5000, fromTo: 'Cash Main' }), ctx.index)
    expect(received).toMatchObject({ fromAccount: 'Cash Main', toAccount: 'Savings' })
  })

  it('copies the tags', () => {
    const e = entry()
    expect(formFromEntry(e, ctx.index).tags).not.toBe(e.tags)
  })
})

describe('choices', () => {
  it('lists the subcategories of a type with their category', () => {
    const food = categoryChoices(categories, 'expense').filter(c => c.category === 'Food')
    expect(food.map(c => c.key)).toEqual(['Groceries', 'Restaurants', 'Food - Misc'])
    expect(categoryChoices(categories, 'transfer').map(c => c.key)).toContain('Credit card payment')
    expect(categoryChoices(categories, 'income').every(c => c.category === 'Income')).toBe(true)
  })

  it('offers active accounts, and no cards for income', () => {
    expect(activeAccounts(accounts).map(a => a.name)).toEqual(['Cash Main', 'Savings', 'Card'])
    expect(accountChoices(accounts, 'expense').map(a => a.name)).toEqual(['Cash Main', 'Savings', 'Card'])
    expect(accountChoices(accounts, 'income').map(a => a.name)).toEqual(['Cash Main', 'Savings'])
  })

  it('splits transfer candidates for a credit card payment only', () => {
    const active = activeAccounts(accounts)
    expect(transferAccountCandidates(active, CREDIT_CARD_PAYMENT)).toEqual({
      fromCandidates: active.filter(a => a.accountType === 'cash'),
      toCandidates: active.filter(a => a.accountType === 'creditCard'),
    })
    expect(transferAccountCandidates(active, 'Account transfer')).toEqual({ fromCandidates: active, toCandidates: active })
  })
})

describe('normalizeAccountsForSubcategory', () => {
  it('clears a card source and a non-card target for a card payment', () => {
    const state = transferForm({ subcategory: CREDIT_CARD_PAYMENT, fromAccount: 'Card', toAccount: 'Savings' })
    expect(normalizeAccountsForSubcategory(state, accounts)).toMatchObject({ fromAccount: '', toAccount: '' })
  })

  it('keeps a valid pair and an empty target', () => {
    const ok = transferForm({ subcategory: CREDIT_CARD_PAYMENT, fromAccount: 'Cash Main', toAccount: 'Card' })
    expect(normalizeAccountsForSubcategory(ok, accounts)).toEqual(ok)
    const emptyTarget = transferForm({ subcategory: CREDIT_CARD_PAYMENT, toAccount: '' })
    expect(normalizeAccountsForSubcategory(emptyTarget, accounts).toAccount).toBe('')
  })

  it('leaves other subcategories alone', () => {
    const state = transferForm({ fromAccount: 'Card' })
    expect(normalizeAccountsForSubcategory(state, accounts)).toBe(state)
  })
})

describe('resetFormForType', () => {
  it('moves from a plain row to a transfer, clearing the account and an unrelated subcategory', () => {
    const next = resetFormForType(form({ isRefund: true }), 'transfer', ctx)
    expect(next).toMatchObject({ type: 'transfer', account: '', subcategory: '', isRefund: false })
  })

  it('moves from a transfer to a plain row, clearing the from and to accounts', () => {
    const next = resetFormForType(transferForm({ account: 'Cash Main' }), 'income', ctx)
    expect(next).toMatchObject({ type: 'income', fromAccount: '', toAccount: '', subcategory: '' })
    expect(next.account).toBe('Cash Main')
  })

  it('keeps a subcategory that still fits and a refund within expense', () => {
    const next = resetFormForType(form({ isRefund: true }), 'expense', ctx)
    expect(next).toMatchObject({ subcategory: 'Groceries', isRefund: true })
  })

  it('keeps a transfer subcategory when staying on transfer', () => {
    expect(resetFormForType(transferForm(), 'transfer', ctx)).toMatchObject({ subcategory: 'Account transfer', fromAccount: 'Cash Main' })
  })
})

describe('addTagToList', () => {
  it('rejects empty and blank input', () => {
    expect(addTagToList(['a'], '')).toEqual({ kind: 'empty' })
    expect(addTagToList(['a'], '   ')).toEqual({ kind: 'empty' })
    expect(addTagToList(['a'], '#')).toEqual({ kind: 'empty' })
  })

  it('strips the hash, trims and lowercases', () => {
    expect(addTagToList(['a'], '#Foo')).toEqual({ kind: 'added', next: ['a', 'foo'] })
    expect(addTagToList([], '  Bar  ')).toEqual({ kind: 'added', next: ['bar'] })
  })

  it('rejects invalid tags', () => {
    expect(addTagToList([], 'foo,bar').kind).toBe('invalid')
    expect(addTagToList([], 'a|b').kind).toBe('invalid')
  })

  it('rejects a space inside a tag name, but trims spaces around it', () => {
    expect(addTagToList([], 'two words').kind).toBe('invalid')
    expect(addTagToList([], 'a\tb').kind).toBe('invalid')
    expect(addTagToList([], '  word  ')).toEqual({ kind: 'added', next: ['word'] })
  })

  it('reports a tag over sixteen characters as too long, not just invalid', () => {
    expect(addTagToList([], 'abcdefghijklmnopq')).toEqual({ kind: 'too-long' })
    expect(addTagToList([], 'abcdefghijklmnop').kind).toBe('added')
  })

  it('allows dashes and digits but rejects underscores and other symbols', () => {
    expect(addTagToList([], 'q3-2026')).toEqual({ kind: 'added', next: ['q3-2026'] })
    expect(addTagToList([], 'under_score').kind).toBe('invalid')
    expect(addTagToList([], 'a.b').kind).toBe('invalid')
    expect(addTagToList([], 'café').kind).toBe('invalid')
  })

  it('lowercases before checking, so an uppercase tag is accepted as lowercase', () => {
    expect(addTagToList([], 'NEED')).toEqual({ kind: 'added', next: ['need'] })
  })

  it('treats differently cased input as a duplicate', () => {
    expect(addTagToList(['foo'], 'FOO')).toEqual({ kind: 'duplicate' })
  })

  it('caps the list at three', () => {
    expect(addTagToList(['a', 'b', 'c'], 'd')).toEqual({ kind: 'max' })
  })
})

describe('pendingTagProblem', () => {
  it('names the problem for text that can never become a tag', () => {
    expect(pendingTagProblem([], 'abcdefghijklmnopq')).toBe('err.tagTooLong')
    expect(pendingTagProblem([], 'under_score')).toBe('err.tagInvalid')
    expect(pendingTagProblem([], 'foo,bar')).toBe('err.tagInvalid')
    expect(pendingTagProblem([], 'two words')).toBe('err.tagInvalid')
    expect(pendingTagProblem([], 'a|b')).toBe('err.tagInvalid')
  })

  it('has no problem with an empty box or a tag that can be added', () => {
    expect(pendingTagProblem([], '')).toBeNull()
    expect(pendingTagProblem([], '   ')).toBeNull()
    expect(pendingTagProblem(['a'], 'fine')).toBeNull()
  })

  it('does not block on a duplicate, which is simply ignored, or on a full list', () => {
    expect(pendingTagProblem(['foo'], 'FOO')).toBeNull()
    expect(pendingTagProblem(['a', 'b', 'c'], 'd')).toBeNull()
  })
})

describe('validateTransactionForm', () => {
  const error = (state: TransactionFormState) => {
    const result = validateTransactionForm(state, ctx)
    return result.ok ? null : result.errorKey
  }

  it('accepts a valid expense, income and transfer', () => {
    expect(error(form())).toBeNull()
    expect(error(form({ type: 'income', subcategory: 'Salary' }))).toBeNull()
    expect(error(transferForm())).toBeNull()
    expect(error(transferForm({ subcategory: CREDIT_CARD_PAYMENT, toAccount: 'Card' }))).toBeNull()
  })

  it('checks the date and amount first', () => {
    expect(error(form({ date: '' }))).toBe('err.invalidDate')
    expect(error(form({ date: '2026-02-30' }))).toBe('err.invalidDate')
    expect(error(form({ amount: '' }))).toBe('err.amountRequired')
    expect(error(form({ amount: 'abc' }))).toBe('err.amountInvalid')
    expect(error(form({ amount: '1.234' }))).toBe('err.amountInvalid')
    expect(error(form({ amount: '0' }))).toBe('err.amountPositive')
    expect(error(form({ amount: '-5' }))).toBe('err.amountPositive')
  })

  it('requires the right accounts for the type', () => {
    expect(error(form({ account: '' }))).toBe('err.accountRequired')
    expect(error(transferForm({ fromAccount: '' }))).toBe('err.fromAccountRequired')
    expect(error(transferForm({ toAccount: '' }))).toBe('err.toAccountRequired')
    expect(error(form({ account: 'Nope' }))).toBe('err.accountRequired')
  })

  it('requires a subcategory of the right kind', () => {
    expect(error(form({ subcategory: '' }))).toBe('err.subcategoryRequired')
    expect(error(form({ subcategory: 'Nope' }))).toBe('err.subcategoryUnknown')
    expect(error(form({ subcategory: 'Account transfer' }))).toBe('err.subcategoryWrongType')
    expect(error(transferForm({ subcategory: 'Groceries' }))).toBe('err.subcategoryWrongType')
    expect(error(transferForm({ subcategory: 'Nope' }))).toBe('err.subcategoryUnknown')
  })

  it('applies the transfer rules', () => {
    expect(error(transferForm({ toAccount: 'Cash Main' }))).toBe('err.sameAccount')
    expect(error(transferForm({ subcategory: CREDIT_CARD_PAYMENT, fromAccount: 'Card', toAccount: 'Savings' }))).toBe('err.fromMustNotBeCreditCard')
    expect(error(transferForm({ subcategory: CREDIT_CARD_PAYMENT, toAccount: 'Savings' }))).toBe('err.toMustBeCreditCard')
  })
})

describe('buildDraft', () => {
  it('stores an expense negative', () => {
    expect(buildDraft(form({ merchant: 'Publix', tags: ['A', 'a', 'b'], note: 'n' }))).toEqual({
      kind: 'entry',
      entry: {
        account: 'Cash Main', date: '2026-05-03', merchant: 'Publix', subcategory: 'Groceries',
        amountCents: -1250, note: 'n', tags: ['a', 'b'], fromTo: '',
      },
    })
  })

  it('stores a refund positive and income positive', () => {
    expect(buildDraft(form({ isRefund: true }))).toMatchObject({ entry: { amountCents: 1250 } })
    expect(buildDraft(form({ type: 'income', subcategory: 'Salary' }))).toMatchObject({ entry: { amountCents: 1250 } })
  })

  it('builds a transfer input with positive cents', () => {
    expect(buildDraft(transferForm({ tags: ['X'] }))).toEqual({
      kind: 'transfer',
      input: {
        date: '2026-05-03', merchant: '', subcategory: 'Account transfer', cents: 1250,
        note: '', tags: ['x'], from: 'Cash Main', to: 'Savings',
      },
    })
  })

  it('treats an unparsable amount as zero rather than throwing', () => {
    expect(buildDraft(form({ amount: 'x' }))).toMatchObject({ entry: { amountCents: 0 } })
  })
})
