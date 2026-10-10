import { describe, expect, it } from 'vitest'
import { loanDebt } from '../../domain/loans'
import { formatCents } from '../../domain/money'
import type { Account } from '../../domain/types'
import { debtCard, debtTotals } from '../../view/debtRows'

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

describe('debtTotals', () => {
  it('sums what is owed across the loans', () => {
    const loans = [loanDebt(loan(), -1000000, TODAY), loanDebt(loan({ name: 'House' }), -250050, TODAY)]
    expect(debtTotals(loans)).toEqual({ owedCents: 1250050, loans: 2 })
  })

  it('is zero without loans', () => {
    expect(debtTotals([])).toEqual({ owedCents: 0, loans: 0 })
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
