import type { BudgetProgress } from '../domain/budget'
import { formatCents } from '../domain/money'
import { t, tn } from '../labels'

// The hover text of a progress bar: what is left of the plan, or by how much it is exceeded.
export function leftText(progress: BudgetProgress): string {
  if (progress.state === 'at') return t('budget.onBudget')
  const amount = formatCents(Math.abs(progress.leftCents))
  return tn(progress.state === 'under' ? 'budget.left' : 'budget.over', { amount })
}

export function barWidth(progress: BudgetProgress): string {
  return `${progress.pct}%`
}
