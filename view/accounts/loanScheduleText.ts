import { loanSchedule } from '../../domain/accounts'
import type { Account } from '../../domain/types'
import { tn } from '../../labels'

// "Ends 2052-09 · 311 mo left" for a loan with a start date and a term, nothing otherwise.
export function loanScheduleText(account: Account, today: string): string | null {
  const schedule = loanSchedule(account, today)
  if (!schedule) return null
  if (schedule.monthsLeft === 0) return tn('accounts.loanEnded', { end: schedule.endMonth })
  return tn('accounts.loanEnds', { end: schedule.endMonth, months: String(schedule.monthsLeft) })
}
