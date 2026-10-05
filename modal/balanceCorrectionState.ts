import { currentBalance } from '../domain/accounts'
import { isIsoDate } from '../domain/dates'
import { parseCents } from '../domain/money'
import type { Account, Transaction } from '../domain/types'
import type { LabelKey } from '../labels'

export interface CorrectionForm {
  balance: string
  asOf: string
  // What the bank shows right now; only compared against, never stored.
  knownToday: string
}

export interface ParsedCorrection {
  balanceCents: number
  asOf: string
  knownTodayCents: number | null
}

export type CorrectionParse = { ok: true; value: ParsedCorrection } | { ok: false; reason: LabelKey }

export type CorrectionCheck = { status: 'match' } | { status: 'mismatch'; diffCents: number }

export interface CorrectionPreview {
  previousCents: number
  projectedCents: number
  rowsAfter: number
  netAfterCents: number
  // Rows on or before the date: the entered balance already includes them.
  rowsCovered: number
  // A past date with later rows: those rows are added on top of the entered balance.
  warnPastDate: boolean
  check: CorrectionCheck | null
}

// What saving a correction writes. A mismatch the user saved anyway marks the account unbalanced
// by the amount; any other save passes `unbalancedCents: undefined`, which clears an earlier mark.
export interface BalanceCorrection {
  enteredBalanceCents: number
  enteredBalanceAsOf: string
  unbalancedCents: number | undefined
}

export function correctionPatch(input: ParsedCorrection, preview: CorrectionPreview): BalanceCorrection {
  return {
    enteredBalanceCents: input.balanceCents,
    enteredBalanceAsOf: input.asOf,
    unbalancedCents: preview.check?.status === 'mismatch' ? preview.check.diffCents : undefined,
  }
}

export function parseCorrectionForm(form: CorrectionForm): CorrectionParse {
  if (form.balance.trim() === '') return { ok: false, reason: 'err.balanceRequired' }
  const balanceCents = parseCents(form.balance)
  if (balanceCents === null) return { ok: false, reason: 'err.amountInvalid' }
  if (balanceCents < 0) return { ok: false, reason: 'err.balanceNegative' }
  if (!isIsoDate(form.asOf)) return { ok: false, reason: 'err.invalidDate' }
  if (form.knownToday.trim() === '') return { ok: true, value: { balanceCents, asOf: form.asOf, knownTodayCents: null } }
  const knownTodayCents = parseCents(form.knownToday)
  if (knownTodayCents === null) return { ok: false, reason: 'err.amountInvalid' }
  if (knownTodayCents < 0) return { ok: false, reason: 'err.balanceNegative' }
  return { ok: true, value: { balanceCents, asOf: form.asOf, knownTodayCents } }
}

// What the account's current balance would become if the correction were saved, computed on
// the fly from its rows; nothing is written.
export function previewCorrection(
  account: Account, transactions: Transaction[], input: ParsedCorrection, today: string,
): CorrectionPreview {
  const next: Account = { ...account, enteredBalanceCents: input.balanceCents, enteredBalanceAsOf: input.asOf }
  const projectedCents = currentBalance(next, transactions)
  const after = transactions.filter((tx) => tx.date > input.asOf)
  const netAfterCents = after.reduce((sum, tx) => sum + tx.amountCents, 0)
  const check: CorrectionCheck | null = input.knownTodayCents === null ? null
    : projectedCents === input.knownTodayCents ? { status: 'match' }
    : { status: 'mismatch', diffCents: projectedCents - input.knownTodayCents }
  return {
    previousCents: account.balanceCents,
    projectedCents,
    rowsAfter: after.length,
    netAfterCents,
    rowsCovered: transactions.length - after.length,
    warnPastDate: input.asOf < today && after.length > 0,
    check,
  }
}
