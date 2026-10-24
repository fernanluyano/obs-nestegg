import type { LedgerEntry, TransactionType } from '../domain/types'
import { formatCents } from '../domain/money'

export type DetailLine =
  | { kind: 'tags'; tags: string[] }
  | { kind: 'note'; text: string }
  | { kind: 'empty' }

// Money coming back under an expense category.
export function isMoneyBack(entry: LedgerEntry, type: TransactionType | undefined): boolean {
  return type === 'expense' && entry.amountCents > 0
}

// A transfer row reads in the direction its sign gives: sent rows are "this → other". The names
// come back separately so each can be coloured by its own account.
export function accountLabels(entry: LedgerEntry): string[] {
  if (!entry.fromTo) return [entry.account || '—']
  return entry.amountCents < 0 ? [entry.account, entry.fromTo] : [entry.fromTo, entry.account]
}

export function accountSummary(entry: LedgerEntry): string {
  return accountLabels(entry).join(' → ')
}

export function rowTitle(entry: LedgerEntry): string {
  return entry.merchant ? `${entry.subcategory} · ${entry.merchant}` : entry.subcategory
}

export function amountFigure(
  entry: LedgerEntry,
  type: TransactionType | undefined,
): { text: string; className: string } {
  let className = 'ne-tx-amount'
  if (isMoneyBack(entry, type)) className += ' is-refund'
  else if (type === 'income') className += ' is-income'
  else if (type === 'expense') className += ' is-expense'

  const sign = entry.amountCents > 0 ? '+' : entry.amountCents < 0 ? '-' : ''
  return { text: sign + formatCents(Math.abs(entry.amountCents)), className }
}

export function detailLine(entry: LedgerEntry): DetailLine {
  if (entry.tags.length > 0) return { kind: 'tags', tags: entry.tags }
  const note = entry.note.trim()
  if (note !== '') return { kind: 'note', text: note }
  return { kind: 'empty' }
}
