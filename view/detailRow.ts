import type { Transaction } from '../types'
import { formatCents } from '../money'

export type Line3Display =
  | { kind: 'tags'; tags: string[] }
  | { kind: 'note'; text: string }
  | { kind: 'empty' }

export function isRefund(tx: Transaction): boolean {
  return tx.type === 'expense' && tx.amountCents < 0
}

export function buildWalletText(tx: Transaction): string {
  if (tx.wallet) return tx.wallet
  if (tx.fromWallet && tx.toWallet) return `${tx.fromWallet} → ${tx.toWallet}`
  return '—'
}

export function buildAmountDisplay(
  tx: Transaction,
): { text: string; className: string } {
  const refund = isRefund(tx)
  const className = refund
    ? 'ne-tx-amount is-refund'
    : tx.type === 'income'  ? 'ne-tx-amount is-income'
    : tx.type === 'expense' ? 'ne-tx-amount is-expense'
    : 'ne-tx-amount'
  const prefix = refund
    ? '+'
    : tx.type === 'expense' ? '-'
    : tx.type === 'income'  ? '+'
    : ''
  const displayAmount = refund ? -tx.amountCents : tx.amountCents
  return { text: prefix + formatCents(displayAmount), className }
}

export function buildLine3Display(tx: Transaction): Line3Display {
  if (tx.tags && tx.tags.length > 0) return { kind: 'tags', tags: tx.tags }
  if (tx.note && tx.note.trim() !== '') return { kind: 'note', text: tx.note.trim() }
  return { kind: 'empty' }
}
