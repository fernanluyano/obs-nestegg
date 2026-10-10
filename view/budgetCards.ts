import type { BudgetSummary } from '../domain/budget'
import { formatCents } from '../domain/money'
import { t, tn } from '../labels'

export type CardVariant = 'income' | 'expense' | 'positive' | 'negative' | 'neutral'

export interface BudgetCard {
  label: string
  valueCents: number
  variant: CardVariant
  hint: string
  signed: boolean
  hero: boolean
}

// The leading +/- of a metric. A card that does not show signs still keeps its colour.
export function metricText(valueCents: number, variant: CardVariant, signed: boolean): string {
  const prefix = !signed ? '' :
    variant === 'income' || variant === 'positive' ? '+' :
    variant === 'expense' || variant === 'negative' ? '-' :
    ''
  return prefix + formatCents(Math.abs(valueCents))
}

// Four cards, each answering one question about the month. Spending is all money out compared with
// the plan; Unbudgeted is the part of it that no plan line covers; income never enters spending.
export function budgetCards(summary: BudgetSummary): BudgetCard[] {
  const card = { signed: false, hero: false }
  return [
    {
      ...card,
      label: t('budget.card.income'),
      valueCents: summary.incomeActualCents,
      variant: 'income',
      hint: tn('budget.card.receivedOf', { amount: formatCents(summary.incomePlannedCents) }),
    },
    {
      ...card,
      label: t('budget.card.budget'),
      valueCents: summary.expenseActualCents,
      variant: 'expense',
      hint: tn('budget.card.spentOf', { amount: formatCents(summary.expensePlannedCents) }),
    },
    {
      ...card,
      label: t('budget.card.unbudgeted'),
      valueCents: summary.unbudgetedCents,
      variant: 'expense',
      hint: t('budget.card.unbudgetedHint'),
    },
    {
      label: t('budget.card.surplus'),
      valueCents: summary.surplusCents,
      variant: summary.surplusCents >= 0 ? 'positive' : 'negative',
      hint: t('budget.card.surplusHint'),
      signed: true,
      hero: true,
    },
  ]
}
