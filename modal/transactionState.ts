import type { CategoryIndex } from '../domain/categories'
import { subcategoryOptions } from '../domain/categories'
import { CREDIT_CARD_PAYMENT } from '../domain/defaults'
import { transferProblem, entryProblem, type EntryProblem } from '../domain/entryRules'
import { isIsoDate } from '../domain/dates'
import { centsToDecimal, parseCents } from '../domain/money'
import { normalizeTag, normalizeTags } from '../domain/names'
import { signedAmount, splitAmount, type TransactionDraft } from '../domain/transactions'
import type { Account, Category, LedgerEntry, TransactionModalParams, TransactionType } from '../domain/types'
import { TAG_MAX_LENGTH, validateTag } from '../utils'

/** Form state shared between the desktop and mobile transaction modals. */
export interface TransactionFormState {
  date: string         // 'yyyy-mm-dd'
  type: TransactionType
  account: string
  fromAccount: string
  toAccount: string
  subcategory: string
  merchant: string
  note: string
  tags: string[]
  amount: string       // raw input string (not parsed yet)
  isRefund: boolean
}

export interface FormContext {
  accounts: Account[]     // every account, for rule checks
  index: CategoryIndex
  categories: Category[]
  defaultAccount: string
}

export const activeAccounts = (accounts: Account[]): Account[] => accounts.filter(a => a.active)

export function initialFormState(params: TransactionModalParams, today: string, ctx: FormContext): TransactionFormState {
  const active = activeAccounts(ctx.accounts)
  const fallback = active.find(a => a.name === ctx.defaultAccount) ?? active[0]
  return {
    date: params.date ?? today,
    type: params.type ?? 'expense',
    account: params.account ?? fallback?.name ?? '',
    fromAccount: params.fromAccount ?? '',
    toAccount: params.toAccount ?? '',
    subcategory: params.subcategory ?? '',
    merchant: params.merchant ?? '',
    note: params.note ?? '',
    tags: params.tags ? [...params.tags] : [],
    amount: params.amountCents != null ? centsToDecimal(params.amountCents) : '',
    isRefund: false,
  }
}

// A transfer row's sign says which way the money went: negative means this account sent it.
export function formFromEntry(entry: LedgerEntry, index: CategoryIndex): TransactionFormState {
  const isTransfer = entry.fromTo !== ''
  const type: TransactionType = isTransfer ? 'transfer' : (index.typeOf(entry.subcategory) ?? 'expense')
  const { cents, isRefund } = splitAmount(type, entry.amountCents)
  const sent = entry.amountCents < 0
  return {
    date: entry.date,
    type,
    account: isTransfer ? '' : entry.account,
    fromAccount: isTransfer ? (sent ? entry.account : entry.fromTo) : '',
    toAccount: isTransfer ? (sent ? entry.fromTo : entry.account) : '',
    subcategory: entry.subcategory,
    merchant: entry.merchant,
    note: entry.note,
    tags: [...entry.tags],
    amount: centsToDecimal(cents),
    isRefund,
  }
}

export interface CategoryChoice {
  key: string      // the subcategory name, which is what a transaction stores
  label: string
  category: string
}

// One choice per subcategory of the given type. Names are unique across categories, so the
// subcategory alone identifies the row; the category is shown as the group.
export function categoryChoices(categories: Category[], type: TransactionType): CategoryChoice[] {
  return subcategoryOptions(categories, type).map(o => ({ key: o.subcategory, label: o.subcategory, category: o.category }))
}

export function accountChoices(accounts: Account[], type: TransactionType): Account[] {
  const active = activeAccounts(accounts)
  return type === 'income' ? active.filter(a => a.accountType !== 'creditCard') : active
}

// A card payment goes from a non-card account to a card; any other transfer allows every account.
export function transferAccountCandidates(
  active: Account[],
  subcategory: string,
): { fromCandidates: Account[]; toCandidates: Account[] } {
  if (subcategory === CREDIT_CARD_PAYMENT) {
    return {
      fromCandidates: active.filter(a => a.accountType !== 'creditCard'),
      toCandidates: active.filter(a => a.accountType === 'creditCard'),
    }
  }
  return { fromCandidates: active, toCandidates: active }
}

// Clears an account choice the card-payment subcategory has made impossible.
export function normalizeAccountsForSubcategory(state: TransactionFormState, accounts: Account[]): TransactionFormState {
  if (state.subcategory !== CREDIT_CARD_PAYMENT) return state
  const typeOf = (name: string) => accounts.find(a => a.name === name)?.accountType
  return {
    ...state,
    fromAccount: typeOf(state.fromAccount) === 'creditCard' ? '' : state.fromAccount,
    toAccount: state.toAccount && typeOf(state.toAccount) !== 'creditCard' ? '' : state.toAccount,
  }
}

// Switching type clears what no longer applies: the other type's accounts and a subcategory
// that does not belong to the new type.
export function resetFormForType(state: TransactionFormState, type: TransactionType, ctx: FormContext): TransactionFormState {
  const isPlain = type !== 'transfer'
  const stillValid = categoryChoices(ctx.categories, type).some(c => c.key === state.subcategory)
  return {
    ...state,
    type,
    isRefund: type === 'expense' ? state.isRefund : false,
    account: isPlain ? state.account : '',
    fromAccount: isPlain ? '' : state.fromAccount,
    toAccount: isPlain ? '' : state.toAccount,
    subcategory: stillValid ? state.subcategory : '',
  }
}

export type AddTagResult =
  | { kind: 'added'; next: string[] }
  | { kind: 'empty' }
  | { kind: 'too-long' }
  | { kind: 'invalid' }
  | { kind: 'duplicate' }
  | { kind: 'max' }

export const TAG_LIMIT = 3

/**
 * Pure tag-list update. Tags are lowercase, so "Gift" and "gift" are one tag.
 * Modal callsite handles input clearing, dropdown hiding and chip rendering.
 */
export function addTagToList(current: string[], raw: string): AddTagResult {
  const normalized = normalizeTag(raw)
  if (!normalized) return { kind: 'empty' }
  if ([...normalized].length > TAG_MAX_LENGTH) return { kind: 'too-long' }
  if (!validateTag(normalized)) return { kind: 'invalid' }
  if (current.includes(normalized)) return { kind: 'duplicate' }
  if (current.length >= TAG_LIMIT) return { kind: 'max' }
  return { kind: 'added', next: [...current, normalized] }
}

export type PendingTagProblem = 'err.tagTooLong' | 'err.tagInvalid'

// Text typed into the tag box but not yet turned into a chip. If it can never become a tag, the
// form must not save, rather than quietly leave it out.
export function pendingTagProblem(current: string[], raw: string): PendingTagProblem | null {
  const result = addTagToList(current, raw)
  if (result.kind === 'too-long') return 'err.tagTooLong'
  if (result.kind === 'invalid') return 'err.tagInvalid'
  return null
}

export type ValidationErrorKey =
  | 'err.invalidDate'
  | 'err.amountRequired'
  | 'err.amountPositive'
  | 'err.amountInvalid'
  | 'err.accountRequired'
  | 'err.fromAccountRequired'
  | 'err.toAccountRequired'
  | 'err.subcategoryRequired'
  | 'err.subcategoryUnknown'
  | 'err.subcategoryWrongType'
  | 'err.fromMustNotBeCreditCard'
  | 'err.toMustBeCreditCard'
  | 'err.sameAccount'

export type ValidationResult =
  | { ok: true }
  | { ok: false; errorKey: ValidationErrorKey }

/** Checks run in the order the user fills the form, so the first message is the first thing to fix. */
export function validateTransactionForm(state: TransactionFormState, ctx: FormContext): ValidationResult {
  const fail = (errorKey: ValidationErrorKey): ValidationResult => ({ ok: false, errorKey })
  if (!isIsoDate(state.date)) return fail('err.invalidDate')
  if (!state.amount) return fail('err.amountRequired')
  const cents = parseCents(state.amount)
  if (cents === null) return fail('err.amountInvalid')
  if (cents <= 0) return fail('err.amountPositive')

  if (state.type === 'transfer') {
    if (!state.fromAccount) return fail('err.fromAccountRequired')
    if (!state.toAccount) return fail('err.toAccountRequired')
  } else if (!state.account) {
    return fail('err.accountRequired')
  }
  if (!state.subcategory) return fail('err.subcategoryRequired')

  const problem = state.type === 'transfer'
    ? transferProblem(buildTransferInput(state), ctx)
    : entryProblem(buildEntry(state), ctx)
  return problem ? fail(PROBLEM_MESSAGES[problem]) : { ok: true }
}

const PROBLEM_MESSAGES: Record<EntryProblem, ValidationErrorKey> = {
  invalidDate: 'err.invalidDate',
  invalidAmount: 'err.amountInvalid',
  amountNotPositive: 'err.amountPositive',
  unknownAccount: 'err.accountRequired',
  unknownSubcategory: 'err.subcategoryUnknown',
  subcategoryIsTransfer: 'err.subcategoryWrongType',
  subcategoryNotTransfer: 'err.subcategoryWrongType',
  unexpectedFromTo: 'err.subcategoryWrongType',
  sameAccount: 'err.sameAccount',
  fromMustNotBeCreditCard: 'err.fromMustNotBeCreditCard',
  toMustBeCreditCard: 'err.toMustBeCreditCard',
}

function buildTransferInput(state: TransactionFormState) {
  return {
    date: state.date,
    merchant: state.merchant,
    subcategory: state.subcategory,
    cents: parseCents(state.amount) ?? 0,
    note: state.note,
    tags: normalizeTags(state.tags),
    from: state.fromAccount,
    to: state.toAccount,
  }
}

function buildEntry(state: TransactionFormState): LedgerEntry {
  const cents = parseCents(state.amount) ?? 0
  return {
    account: state.account,
    date: state.date,
    merchant: state.merchant,
    subcategory: state.subcategory,
    amountCents: signedAmount(state.type === 'income' ? 'income' : 'expense', cents, state.isRefund),
    note: state.note,
    tags: normalizeTags(state.tags),
    fromTo: '',
  }
}

/** Builds what the ledger saves. Assumes the state passed validateTransactionForm. */
export function buildDraft(state: TransactionFormState): TransactionDraft {
  return state.type === 'transfer'
    ? { kind: 'transfer', input: buildTransferInput(state) }
    : { kind: 'entry', entry: buildEntry(state) }
}
