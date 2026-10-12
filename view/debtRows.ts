import { loanSchedule } from '../domain/accounts'
import type { LoanDebt } from '../domain/loans'
import { formatCents } from '../domain/money'
import { t, tn } from '../labels'
import type { CardDebt } from '../snapshot/queries'

export interface DebtStat {
  label: string
  value: string
}

export interface DebtCard {
  stats: DebtStat[]
  // What the loan still needs before progress or the payoff curve can show.
  hints: string[]
}

export interface DebtTotals {
  loansCents: number
  cardsCents: number
  owedCents: number // loans and credit cards together
}

export function debtTotals(loans: LoanDebt[], cards: CardDebt[]): DebtTotals {
  const loansCents = loans.reduce((sum, l) => sum + l.owedCents, 0)
  const cardsCents = cards.reduce((sum, c) => sum + c.owedCents, 0)
  return { loansCents, cardsCents, owedCents: loansCents + cardsCents }
}

export interface CardRow {
  name: string
  color: string
  owedText: string
}

// One line per credit card for the single card that lists them all.
export function creditCardRows(cards: CardDebt[]): CardRow[] {
  return cards.map(({ account, owedCents }) => ({ name: account.name, color: account.color, owedText: formatCents(owedCents) }))
}

// Only what can be derived is shown; a missing field adds a hint instead of an empty row.
export function debtCard(loan: LoanDebt, today: string): DebtCard {
  const { account, projection } = loan
  const stats: DebtStat[] = [{ label: t('debt.balance'), value: formatCents(loan.owedCents) }]
  const hints: string[] = []

  if (account.interest !== undefined) stats.push({ label: t('debt.interest'), value: `${account.interest}%` })
  if (account.originalCents !== undefined) stats.push({ label: t('debt.original'), value: formatCents(account.originalCents) })
  if (loan.percentPaid !== null) stats.push({ label: t('debt.paid'), value: `${loan.percentPaid.toFixed(1)}%` })
  else hints.push(t('debt.needsOriginal'))

  if (loan.monthsElapsed !== null) stats.push({ label: t('debt.elapsed'), value: String(loan.monthsElapsed) })
  const schedule = loanSchedule(account, today)
  if (schedule) stats.push({ label: t('debt.remaining'), value: String(schedule.monthsLeft) })

  if (projection) {
    stats.push({ label: t('debt.payoff'), value: tn('debt.monthsShort', { months: String(projection.payoffMonths) }) })
    const { baseline } = loan
    if (baseline && projection.extraCents > 0) {
      stats.push({ label: t('debt.monthsSaved'), value: tn('debt.monthsShort', { months: String(baseline.payoffMonths - projection.payoffMonths) }) })
      stats.push({ label: t('debt.interestSaved'), value: formatCents(baseline.interestCents - projection.interestCents) })
    }
  } else if (loan.owedCents > 0) {
    hints.push(t('debt.needsPlan'))
  }
  return { stats, hints }
}
