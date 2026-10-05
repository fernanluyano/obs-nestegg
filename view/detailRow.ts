import type { LedgerEntry, TransactionType } from '../domain/types'
import { formatCents } from '../domain/money'

export type Line3Display =
  | { kind: 'tags'; tags: string[] }
  | { kind: 'note'; text: string }
  | { kind: 'empty' }

// Money coming back under an expense category.
export function isRefund(entry: LedgerEntry, type: TransactionType | undefined): boolean {
  return type === 'expense' && entry.amountCents > 0
}

// A transfer row shows the direction its sign gives: sent rows read "this → other". The names
// are returned separately so each can be colored by its own account.
export function buildAccountParts(entry: LedgerEntry): string[] {
  if (!entry.fromTo) return [entry.account || '—']
  return entry.amountCents < 0 ? [entry.account, entry.fromTo] : [entry.fromTo, entry.account]
}

export function buildAccountText(entry: LedgerEntry): string {
  return buildAccountParts(entry).join(' → ')
}

export function buildTitleText(entry: LedgerEntry): string {
  return entry.merchant ? `${entry.subcategory} · ${entry.merchant}` : entry.subcategory
}

export function buildAmountDisplay(
  entry: LedgerEntry,
  type: TransactionType | undefined,
): { text: string; className: string } {
  const refund = isRefund(entry, type)
  const className = refund
    ? 'ne-tx-amount is-refund'
    : type === 'income' ? 'ne-tx-amount is-income'
    : type === 'expense' ? 'ne-tx-amount is-expense'
    : 'ne-tx-amount'
  const sign = entry.amountCents > 0 ? '+' : entry.amountCents < 0 ? '-' : ''
  return { text: sign + formatCents(Math.abs(entry.amountCents)), className }
}

export function buildLine3Display(entry: LedgerEntry): Line3Display {
  if (entry.tags.length > 0) return { kind: 'tags', tags: entry.tags }
  if (entry.note.trim() !== '') return { kind: 'note', text: entry.note.trim() }
  return { kind: 'empty' }
}
