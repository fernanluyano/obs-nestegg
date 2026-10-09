import { describe, expect, it } from 'vitest'
import { buildSnapshot, emptySnapshot } from '../../snapshot/snapshot'
import {
  accountRenameImpact, canAdvance, canRemoveAccount, categoryRenameImpact, checkBalance, migrationImpact, needsSetup, nextStep,
  prevStep, subcategoryRenameImpact, WIZARD_STEPS,
} from '../../wizard/model'
import { account, budgetInput, category, categoryInput, monthInput, settingsInput, tx, vaultInputs } from '../helpers/fixtures'
import { accountInput } from '../helpers/fixtures'

const card = account({ name: 'Card', accountType: 'creditCard' })
const food = category('Food', 'expense', ['Groceries', 'Food - Misc'])

describe('migrationImpact', () => {
  const snap = buildSnapshot([
    ...vaultInputs({
      months: [
        monthInput('Cash Main', '2026-10', [tx(), tx({ subcategory: 'Restaurants' })]),
        monthInput('Cash Main', '2026-09', [tx({ date: '2026-09-02', subcategory: 'Restaurants' })]),
        monthInput('Cash Main', '2026-08', [tx({ date: '2026-08-02', subcategory: 'Rent' })]),
      ],
    }),
    budgetInput('2026-10', [{ subcategory: 'Groceries', plannedCents: 1 }]),
    budgetInput('2026-09', [{ subcategory: 'Rent', plannedCents: 1 }]),
  ])

  it('counts the month files and budgets that change and the transactions that move', () => {
    expect(migrationImpact(snap, ['Groceries'])).toEqual({ files: 2, transactions: 1 })
    expect(migrationImpact(snap, ['Groceries', 'Restaurants'])).toEqual({ files: 3, transactions: 3 })
  })

  it('is zero when nothing uses the subcategories', () => {
    expect(migrationImpact(snap, ['Tolls'])).toEqual({ files: 0, transactions: 0 })
  })
})

describe('step navigation', () => {
  it('walks the steps in order and stops at both ends', () => {
    expect(WIZARD_STEPS).toEqual(['welcome', 'accounts', 'categories', 'general', 'done'])
    expect(nextStep('welcome')).toBe('accounts')
    expect(nextStep('general')).toBe('done')
    expect(nextStep('done')).toBe('done')
    expect(prevStep('done')).toBe('general')
    expect(prevStep('welcome')).toBe('welcome')
  })
})

describe('canAdvance', () => {
  const snap = (accounts = [account()], settings = { defaultAccount: 'Cash Main', autoValidateOnLoad: true }) =>
    buildSnapshot(vaultInputs({ accounts, months: [], settings }))

  it('lets welcome and done through', () => {
    expect(canAdvance('welcome', emptySnapshot())).toEqual({ ok: true })
    expect(canAdvance('done', emptySnapshot())).toEqual({ ok: true })
  })

  it('requires an active cash account to leave the accounts step', () => {
    expect(canAdvance('accounts', snap())).toEqual({ ok: true })
    expect(canAdvance('accounts', snap([]))).toEqual({ ok: false, reason: 'wizard.needCashAccount' })
  })

  it('does not accept a credit card or an archived account instead of cash', () => {
    expect(canAdvance('accounts', snap([card]))).toMatchObject({ ok: false, reason: 'wizard.needCashAccount' })
    expect(canAdvance('accounts', snap([account({ active: false })]))).toMatchObject({ ok: false })
    expect(canAdvance('accounts', snap([account({ active: false }), card, account({ name: 'Other' })]))).toEqual({ ok: true })
  })

  it('requires at least one category', () => {
    expect(canAdvance('categories', buildSnapshot([accountInput(account())]))).toEqual({ ok: false, reason: 'wizard.needCategory' })
    expect(canAdvance('categories', snap())).toEqual({ ok: true })
  })

  it('names the first category that has no subcategory', () => {
    const empty = category('Hollow', 'expense', [])
    const snapshot = buildSnapshot([categoryInput(food), categoryInput(empty)])
    expect(canAdvance('categories', snapshot)).toEqual({ ok: false, reason: 'wizard.emptyCategory', vars: { name: 'Hollow' } })
  })

  it('counts Misc as a subcategory', () => {
    const miscOnly = category('Lifestyle', 'expense', ['Lifestyle - Misc'])
    expect(canAdvance('categories', buildSnapshot([categoryInput(miscOnly)]))).toEqual({ ok: true })
  })

  it('requires the default account to be an active cash account', () => {
    expect(canAdvance('general', snap())).toEqual({ ok: true })
    expect(canAdvance('general', snap([account(), card], { defaultAccount: 'Card', autoValidateOnLoad: true }))).toMatchObject({ ok: false, reason: 'wizard.needDefaultCash' })
    expect(canAdvance('general', snap([account()], { defaultAccount: 'Gone', autoValidateOnLoad: true }))).toMatchObject({ ok: false })
    expect(canAdvance('general', buildSnapshot([accountInput(account())]))).toMatchObject({ ok: false })
  })
})

describe('needsSetup', () => {
  it('is true exactly while the settings note does not exist', () => {
    expect(needsSetup(emptySnapshot())).toBe(true)
    expect(needsSetup(buildSnapshot([accountInput(account())]))).toBe(true)
    expect(needsSetup(buildSnapshot([settingsInput()]))).toBe(false)
  })
})

describe('canRemoveAccount', () => {
  it('blocks the last active cash account', () => {
    const only = buildSnapshot(vaultInputs({ accounts: [account(), card], months: [] }))
    expect(canRemoveAccount(only, 'Cash Main')).toEqual({ ok: false, reason: 'wizard.lastCashAccount' })
  })

  it('allows a card, a second cash account, and an account that is not the last cash', () => {
    const two = buildSnapshot(vaultInputs({ accounts: [account(), account({ name: 'Savings' }), card], months: [] }))
    expect(canRemoveAccount(two, 'Cash Main')).toEqual({ ok: true })
    expect(canRemoveAccount(two, 'Card')).toEqual({ ok: true })
    const one = buildSnapshot(vaultInputs({ accounts: [account(), card], months: [] }))
    expect(canRemoveAccount(one, 'Card')).toEqual({ ok: true })
  })

  it('does not count an archived cash account as the one that must stay', () => {
    const snap = buildSnapshot(vaultInputs({ accounts: [account(), account({ name: 'Old', active: false })], months: [] }))
    expect(canRemoveAccount(snap, 'Old')).toEqual({ ok: true })
    expect(canRemoveAccount(snap, 'Cash Main')).toMatchObject({ ok: false })
  })
})

describe('checkBalance', () => {
  it('requires the balance to be entered, but accepts zero', () => {
    expect(checkBalance('', 'cash')).toEqual({ ok: false, message: 'err.balanceRequired' })
    expect(checkBalance('   ', 'cash')).toEqual({ ok: false, message: 'err.balanceRequired' })
    expect(checkBalance('0', 'cash')).toEqual({ ok: true, cents: 0 })
    expect(checkBalance('0.00', 'loan')).toEqual({ ok: true, cents: 0 })
  })

  it('parses to cents from the digits', () => {
    expect(checkBalance('1234.50', 'cash')).toEqual({ ok: true, cents: 123450 })
    expect(checkBalance('1.15', 'cash')).toEqual({ ok: true, cents: 115 })
  })

  it('rejects text, too many decimals and a negative cash balance', () => {
    expect(checkBalance('abc', 'cash')).toEqual({ ok: false, message: 'err.amountInvalid' })
    expect(checkBalance('1.234', 'cash')).toEqual({ ok: false, message: 'err.amountInvalid' })
    expect(checkBalance('-5', 'cash')).toEqual({ ok: false, message: 'err.balanceNegative' })
  })

  it('takes a debt as typed, negative, and rejects it positive', () => {
    for (const type of ['creditCard', 'loan'] as const) {
      expect(checkBalance('-3000', type)).toEqual({ ok: true, cents: -300000 })
      expect(checkBalance('3000', type)).toEqual({ ok: false, message: 'err.debtBalancePositive' })
    }
  })
})

describe('rename impact', () => {
  const transferOut = tx({ subcategory: 'Account transfer', amountCents: -5000, fromTo: 'Savings', merchant: '' })
  const transferIn = tx({ subcategory: 'Account transfer', amountCents: 5000, fromTo: 'Cash Main', merchant: '' })
  const snap = buildSnapshot(vaultInputs({
    accounts: [account(), account({ name: 'Savings' })],
    months: [
      monthInput('Cash Main', '2026-10', [tx(), tx({ note: 'b' }), transferOut]),
      monthInput('Cash Main', '2026-09', [tx({ date: '2026-09-02', subcategory: 'Food - Misc' })]),
      monthInput('Savings', '2026-10', [transferIn]),
    ],
  }))

  it('counts the notes and transactions a subcategory rename touches, including the category note', () => {
    expect(subcategoryRenameImpact(snap, 'Groceries')).toEqual({ files: 2, transactions: 2 })
    expect(subcategoryRenameImpact(snap, 'Salary')).toEqual({ files: 1, transactions: 0 })
  })

  it('counts a category rename through its Misc subcategory', () => {
    expect(categoryRenameImpact(snap, 'Food')).toEqual({ files: 2, transactions: 1 })
    expect(categoryRenameImpact(snap, 'Housing')).toEqual({ files: 1, transactions: 0 })
  })

  it('counts an account rename: its note, its months, referencing rows elsewhere, and the settings note', () => {
    expect(accountRenameImpact(snap, 'Cash Main')).toEqual({ files: 1 + 2 + 1 + 1, transactions: 4 + 1 })
    expect(accountRenameImpact(snap, 'Savings')).toEqual({ files: 1 + 1 + 1, transactions: 1 + 1 })
  })

  it('counts only the account note for an account with nothing in it', () => {
    const lone = buildSnapshot(vaultInputs({ accounts: [account(), account({ name: 'Empty' })], months: [] }))
    expect(accountRenameImpact(lone, 'Empty')).toEqual({ files: 1, transactions: 0 })
  })
})
