import type { TransactionType, NesteggConfig, Transaction, Wallet } from '../types'
import { translateCategory } from '../labels'
import { validateTag, dateToMonthDay } from '../utils'
import { centsToDecimal, parseCents } from '../money'

/**
 * Form state shared between TransactionModal and helpers in this module.
 * Mirrors the protected fields on TransactionModal class (date, type, ...).
 */
export interface TransactionFormState {
  date: string         // 'yyyy-mm-dd'
  type: TransactionType
  wallet: string
  fromWallet: string
  toWallet: string
  category: string
  note: string
  tags: string[]
  amount: string       // raw input string (not parsed yet)
  isRefund: boolean
}

/**
 * Parse a stored Transaction.amountCents (negative for refunds)
 * back into modal form state. Mirrors initState's refund unwrap.
 */
export function parseAmountForEdit(rawCents: number): { display: string; isRefund: boolean } {
  if (rawCents < 0) {
    return { display: centsToDecimal(-rawCents), isRefund: true }
  }
  return { display: centsToDecimal(rawCents), isRefund: false }
}

/**
 * Build category dropdown options for a given transaction type.
 * Default keys go through i18n translation; custom labels are user strings.
 */
export function getCategoryOptions(
  config: NesteggConfig,
  type: TransactionType,
): { key: string; label: string }[] {
  const catOptions = type === 'expense'
    ? config.options.categories.expense
    : type === 'income'
      ? config.options.categories.income
      : config.options.categories.transfer

  const defaultKeys = catOptions.default
  const customs = catOptions.custom

  return [
    ...defaultKeys.map(key => ({ key, label: translateCategory(key) })),
    ...customs.map(c => ({ key: c, label: c })),
  ]
}

export type AddTagResult =
  | { kind: 'added'; next: string[] }
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'duplicate' }
  | { kind: 'max' }

/**
 * Pure tag-list update. Modal callsite handles input.value clearing,
 * dropdown hiding, and chip rendering as side effects based on the kind.
 */
export function addTagToList(current: string[], raw: string): AddTagResult {
  const normalized = raw.replace(/^#/, '').trim()
  if (!normalized) return { kind: 'empty' }
  if (!validateTag(normalized)) return { kind: 'invalid' }
  if (current.includes(normalized)) return { kind: 'duplicate' }
  if (current.length >= 3) return { kind: 'max' }
  return { kind: 'added', next: [...current, normalized] }
}

export type ValidationErrorKey =
  | 'err.invalidDate'
  | 'err.amountRequired'
  | 'err.amountPositive'
  | 'err.amountInvalid'
  | 'err.walletRequired'
  | 'err.fromWalletRequired'
  | 'err.toWalletRequired'
  | 'err.fromMustNotBeCreditCard'
  | 'err.toMustBeCreditCard'
  | 'err.sameWallet'

export type ValidationResult =
  | { ok: true }
  | { ok: false; errorKey: ValidationErrorKey }

/**
 * Pure validation. Mirrors the original branching order in
 * TransactionModal.validate so error messages appear in the same priority.
 */
export function validateTransactionForm(
  state: TransactionFormState,
  config: NesteggConfig,
): ValidationResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date)) {
    return { ok: false, errorKey: 'err.invalidDate' }
  }
  if (!state.amount) {
    return { ok: false, errorKey: 'err.amountRequired' }
  }
  const amountCents = parseCents(state.amount)
  if (amountCents === null) {
    return { ok: false, errorKey: 'err.amountInvalid' }
  }
  if (amountCents <= 0) {
    return { ok: false, errorKey: 'err.amountPositive' }
  }

  if (state.type === 'expense' || state.type === 'income') {
    if (!state.wallet) return { ok: false, errorKey: 'err.walletRequired' }
  } else {
    if (!state.fromWallet) return { ok: false, errorKey: 'err.fromWalletRequired' }
    if (!state.toWallet) return { ok: false, errorKey: 'err.toWalletRequired' }
    if (state.category === 'credit_card_payment') {
      const fromType = config.wallets.find(w => w.name === state.fromWallet)?.type
      const toType = config.wallets.find(w => w.name === state.toWallet)?.type
      if (fromType === 'creditCard') {
        return { ok: false, errorKey: 'err.fromMustNotBeCreditCard' }
      }
      if (toType !== 'creditCard') {
        return { ok: false, errorKey: 'err.toMustBeCreditCard' }
      }
    }
    if (state.fromWallet === state.toWallet) {
      return { ok: false, errorKey: 'err.sameWallet' }
    }
  }
  return { ok: true }
}

/**
 * Build a Transaction payload from form state. Mirrors the inline
 * object literal that used to live in handleConfirm.
 *
 * Refund handling: isRefund=true → amount stored as negative.
 */
export function buildTransactionPayload(state: TransactionFormState): Transaction {
  const cents = parseCents(state.amount) ?? 0
  return {
    date: dateToMonthDay(state.date),
    type: state.type,
    wallet:     (state.type === 'expense' || state.type === 'income') ? state.wallet : undefined,
    fromWallet: state.type === 'transfer' ? state.fromWallet : undefined,
    toWallet:   state.type === 'transfer' ? state.toWallet : undefined,
    category:   state.category || undefined,
    note: state.note,
    amountCents: state.isRefund ? -cents : cents,
    tags: state.tags.length ? state.tags : undefined,
  }
}

/**
 * Filter active wallets into from/to candidates for transfer category.
 * cc_payment: from excludes creditCard, to only creditCard.
 * Other categories: both from and to use all active wallets.
 */
export function getTransferWalletCandidates(
  activeWallets: Wallet[],
  category: string,
): { fromCandidates: Wallet[]; toCandidates: Wallet[] } {
  if (category === 'credit_card_payment') {
    return {
      fromCandidates: activeWallets.filter(w => w.type !== 'creditCard'),
      toCandidates: activeWallets.filter(w => w.type === 'creditCard'),
    }
  }
  return { fromCandidates: activeWallets, toCandidates: activeWallets }
}
