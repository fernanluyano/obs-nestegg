import { describe, expect, it } from 'vitest'
import { loanDebt } from '../../domain/loans'
import { formatCents } from '../../domain/money'
import type { Account } from '../../domain/types'
import type { CardDebt } from '../../snapshot/queries'
import { creditCardRows, debtCard, debtTotals } from '../../view/debtRows'

const loan = (over: Partial<Account> = {}): Account => ({
  name: 'Car',
  accountType: 'loan',
  active: true,
  includeInNetAsset: true,
  enteredBalanceCents: -1000000,
  enteredBalanceAsOf: '2026-10-01',
  balanceCents: -1000000,
  color: '#378add',
  loanKind: 'car',
  ...over,
})

const TODAY = '2026-10-04'

const cardDebt = (name: string, owedCents: number, color = '#378add'): CardDebt => ({
  account: { ...loan({ name, color }), accountType: 'creditCard', loanKind: undefined },
  owedCents,
})

describe('debtTotals', () => {
  const loans = [loanDebt(loan(), -1000000, TODAY), loanDebt(loan({ name: 'House' }), -250050, TODAY)]
  const cards = [cardDebt('Visa', 4313), cardDebt('Amex', 11373)]

  it('totals the loans, the credit cards and both together', () => {
    expect(debtTotals(loans, cards)).toEqual({ loansCents: 1250050, cardsCents: 15686, owedCents: 1265736 })
  })

  it('counts credit cards as debt when there are no loans, and loans when there are no cards', () => {
    expect(debtTotals([], cards)).toEqual({ loansCents: 0, cardsCents: 15686, owedCents: 15686 })
    expect(debtTotals(loans, [])).toEqual({ loansCents: 1250050, cardsCents: 0, owedCents: 1250050 })
  })

  it('is zero without either', () => {
    expect(debtTotals([], [])).toEqual({ loansCents: 0, cardsCents: 0, owedCents: 0 })
  })
})

describe('creditCardRows', () => {
  it('gives one line per card with its color and what it owes', () => {
    expect(creditCardRows([cardDebt('Visa', 4313, '#e5484d'), cardDebt('Amex', 0)])).toEqual([
      { name: 'Visa', color: '#e5484d', owedText: '43.13' },
      { name: 'Amex', color: '#378add', owedText: '0.00' },
    ])
  })

  it('is empty without cards', () => {
    expect(creditCardRows([])).toEqual([])
  })
})

describe('debtCard', () => {
  it('shows only the balance and asks for the missing fields on a bare loan', () => {
    const card = debtCard(loanDebt(loan(), -1000000, TODAY), TODAY)
    expect(card.stats).toEqual([{ label: 'Balance', value: '10,000.00' }])
    expect(card.hints).toEqual(['Add the original amount to see progress', 'Add interest, term and start date to see the payoff curve'])
  })

  it('shows progress, schedule and payoff once the loan is filled in', () => {
    const full = loan({ interest: 6, termMonths: 60, startDate: '2026-04-01', originalCents: 2000000 })
    const card = debtCard(loanDebt(full, -1000000, TODAY), TODAY)
    const byLabel = Object.fromEntries(card.stats.map((s) => [s.label, s.value]))
    expect(byLabel).toMatchObject({
      Balance: '10,000.00', Interest: '6%', 'Original amount': '20,000.00', Paid: '50.0%',
      'Months elapsed': '6', 'Months left': '54', 'Paid off in': '54 mo',
    })
    expect(card.hints).toEqual([])
  })

  it('shows no savings rows without an extra payment', () => {
    const plain = loan({ interest: 6, termMonths: 60, startDate: '2026-04-01' })
    const labels = debtCard(loanDebt(plain, -1000000, TODAY), TODAY).stats.map((s) => s.label)
    expect(labels).not.toContain('Time saved')
    expect(labels).not.toContain('Interest saved')
  })

  it('shows the shorter payoff and what the extra payment saves', () => {
    const plain = loan({ interest: 6, termMonths: 60, startDate: '2026-04-01' })
    const base = loanDebt(plain, -1000000, TODAY)
    const faster = loanDebt({ ...plain, extraPaymentCents: 20000 }, -1000000, TODAY)
    const byLabel = Object.fromEntries(debtCard(faster, TODAY).stats.map((s) => [s.label, s.value]))
    const monthsSaved = base.projection!.payoffMonths - faster.projection!.payoffMonths
    expect(monthsSaved).toBeGreaterThan(0)
    expect(byLabel['Paid off in']).toBe(`${faster.projection!.payoffMonths} mo`)
    expect(byLabel['Time saved']).toBe(`${monthsSaved} mo`)
    expect(byLabel['Interest saved']).toBe(formatCents(base.projection!.interestCents - faster.projection!.interestCents))
  })

  it('does not ask for a plan on a loan that is paid off', () => {
    expect(debtCard(loanDebt(loan({ originalCents: 100000 }), 0, TODAY), TODAY).hints).toEqual([])
  })
})
