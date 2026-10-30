import type { CategoryIndex } from '../domain/categories'
import { subcategoryOptions } from '../domain/categories'
import { transferProblem, entryProblem, type EntryProblem } from '../domain/entryRules'
import { isIsoDate } from '../domain/dates'
import { TAG_LIMIT, tagProblem, type TagProblem } from '../domain/tagRules'
import { centsToDecimal, parseCents } from '../domain/money'
import { normalizeTag, normalizeTags } from '../domain/names'
import { interestOf, signedAmount, splitAmount, stripInterestNote, type TransactionDraft } from '../domain/transactions'
import { isTransferLike, type Account, type Category, type LedgerEntry, type TransactionModalParams, type TransactionType } from '../domain/types'
import { MAX_TAG_LENGTH, isValidTag } from '../helpers'

/** What the add/edit form holds while it is open; shared by the desktop and mobile modals. */
export interface EntryDraft {
  date: string         // 'yyyy-mm-dd'
  type: TransactionType
  account: string
  fromAccount: string
  toAccount: string
  subcategory: string
  merchant: string
  note: string
  tags: string[]
  amount: string       // raw input string (not parsed yet); for a loan payment, the principal
  interest: string     // loan payments only: raw input, what was paid on top of the principal
  isRefund: boolean
}

export interface FormContext {
  accounts: Account[]     // every account, for rule checks
  index: CategoryIndex
  categories: Category[]
  defaultAccount: string
}

export const activeAccounts = (accounts: Account[]): Account[] => accounts.filter(a => a.active)

export function initialFormState(params: TransactionModalParams, today: string, ctx: FormContext): EntryDraft {
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
    interest: '',
    isRefund: false,
  }
}

// A transfer row's sign says which way the money went: negative means this account sent it.
// A loan payment is two rows of different size, so its form is read from both: the principal is the
// loan row and the interest is what the cash row holds beyond it. `partner` is the other row, if any.
export function formFromEntry(entry: LedgerEntry, index: CategoryIndex, partner?: LedgerEntry): EntryDraft {
  const isTransfer = entry.fromTo !== ''
  const known = index.typeOf(entry.subcategory)
  const type: TransactionType = isTransfer ? (known === 'debt' ? 'debt' : 'transfer') : (known ?? 'expense')
  const sent = entry.amountCents < 0
  const [cashRow, loanRow] = sent ? [entry, partner] : [partner, entry]
  const loanPayment = type === 'debt' && loanRow !== undefined
  const { cents, isRefund } = loanPayment
    ? { cents: loanRow.amountCents, isRefund: false }
    : splitAmount(type, entry.amountCents)
  const interest = loanPayment && cashRow ? interestOf(cashRow, loanRow) : 0
  return {
    date: entry.date,
    type,
    account: isTransfer ? '' : entry.account,
    fromAccount: isTransfer ? (sent ? entry.account : entry.fromTo) : '',
    toAccount: isTransfer ? (sent ? entry.fromTo : entry.account) : '',
    subcategory: entry.subcategory,
    merchant: entry.merchant,
    note: stripInterestNote(entry.note),
    tags: [...entry.tags],
    amount: centsToDecimal(cents),
    interest: type === 'debt' ? centsToDecimal(interest) : '',
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

// A loan takes transfers only, and a card cannot receive income.
export function accountChoices(accounts: Account[], type: TransactionType): Account[] {
  return activeAccounts(accounts).filter(a => a.accountType !== 'loan' && a.accountType !== 'investing' && !(type === 'income' && a.accountType === 'creditCard'))
}

// The account a debt payment subcategory is tied to, or '' when it is not tied to any (or the
// form is not a debt payment).
export function debtTargetAccount(state: EntryDraft, accounts: Account[]): string {
  if (state.type !== 'debt' || !state.subcategory) return ''
  return accounts.find(a => a.active && a.paymentSubcategory === state.subcategory)?.name ?? ''
}

// Money only leaves a cash account. A transfer lands on another cash account or pays a credit card;
// a debt payment lands on a loan, only the one its subcategory is tied to when it is tied to one.
export function transferAccountCandidates(
  active: Account[], state: EntryDraft,
): { fromCandidates: Account[]; toCandidates: Account[] } {
  const cash = active.filter(a => a.accountType === 'cash')
  if (state.type !== 'debt') return { fromCandidates: cash, toCandidates: active.filter(a => a.accountType === 'cash' || a.accountType === 'creditCard') }
  const tied = debtTargetAccount(state, active)
  return { fromCandidates: cash, toCandidates: active.filter(a => a.accountType === 'loan' && (!tied || a.name === tied)) }
}

// Drops an account choice the type or subcategory has made impossible, and fills in the one
// account a debt payment subcategory is tied to.
export function normalizeTransferForm(state: EntryDraft, accounts: Account[]): EntryDraft {
  const { fromCandidates, toCandidates } = transferAccountCandidates(activeAccounts(accounts), state)
  const tied = debtTargetAccount(state, accounts)
  const keep = (name: string, allowed: Account[]) => (allowed.some(a => a.name === name) ? name : '')
  return {
    ...state,
    fromAccount: keep(state.fromAccount, fromCandidates),
    toAccount: tied || keep(state.toAccount, toCandidates),
  }
}

// Switching type clears what no longer applies: the other type's accounts and a subcategory
// that does not belong to the new type.
export function resetFormForType(state: EntryDraft, type: TransactionType, ctx: FormContext): EntryDraft {
  const isPlain = !isTransferLike(type)
  const stillValid = categoryChoices(ctx.categories, type).some(c => c.key === state.subcategory)
  return {
    ...state,
    type,
    isRefund: type === 'expense' ? state.isRefund : false,
    interest: type === 'debt' ? state.interest : '',
    account: isPlain ? state.account : '',
    fromAccount: isPlain ? '' : state.fromAccount,
    toAccount: isPlain ? '' : state.toAccount,
    subcategory: stillValid ? state.subcategory : '',
  }
}

export type TagAddition =
  | { kind: 'added'; next: string[] }
  | { kind: 'empty' }
  | { kind: 'too-long' }
  | { kind: 'invalid' }
  | { kind: 'duplicate' }
  | { kind: 'max' }

export { TAG_LIMIT }

// Tags are lowercase, so "Gift" and "gift" are one tag. The checks run in this order, and the
// caller decides what to do with the box, the dropdown and the chips for each outcome.
export function tryAddTag(current: string[], raw: string): TagAddition {
  const tag = normalizeTag(raw)
  if (!tag) return { kind: 'empty' }
  if ([...tag].length > MAX_TAG_LENGTH) return { kind: 'too-long' }
  if (!isValidTag(tag)) return { kind: 'invalid' }
  if (current.includes(tag)) return { kind: 'duplicate' }
  if (current.length >= TAG_LIMIT) return { kind: 'max' }
  return { kind: 'added', next: [...current, tag] }
}

export type PendingTagProblem = 'err.tagTooLong' | 'err.tagInvalid'

// Text typed into the tag box but not yet turned into a chip. If it can never become a tag, the
// form must not save, rather than quietly leave it out.
export function pendingTagProblem(current: string[], raw: string): PendingTagProblem | null {
  const { kind } = tryAddTag(current, raw)
  if (kind === 'too-long') return 'err.tagTooLong'
  if (kind === 'invalid') return 'err.tagInvalid'
  return null
}

export type DraftErrorKey =
  | 'err.invalidDate'
  | 'err.amountRequired'
  | 'err.amountPositive'
  | 'err.amountInvalid'
  | 'err.interestRequired'
  | 'err.interestInvalid'
  | 'err.accountRequired'
  | 'err.fromAccountRequired'
  | 'err.toAccountRequired'
  | 'err.subcategoryRequired'
  | 'err.subcategoryUnknown'
  | 'err.subcategoryWrongType'
  | 'err.fromMustBeCash'
  | 'err.transferToLoan'
  | 'err.debtToNonLoan'
  | 'err.wrongDebtAccount'
  | 'err.loanTransfersOnly'
  | 'err.investingNoTransactions'
  | 'err.sameAccount'
  | 'err.conflictingTags'
  | 'err.tagTooLong'
  | 'err.tagInvalid'
  | 'err.tagMissing'
  | 'err.tagsTooMany'
  | 'err.tagsDuplicate'

export type DraftVerdict =
  | { ok: true }
  | { ok: false; errorKey: DraftErrorKey }

const reject = (errorKey: DraftErrorKey): DraftVerdict => ({ ok: false, errorKey })

// Checks run in the order the user fills the form, so the first message is the first thing to fix.
export function checkDraft(draft: EntryDraft, ctx: FormContext): DraftVerdict {
  if (!isIsoDate(draft.date)) return reject('err.invalidDate')
  if (!draft.amount) return reject('err.amountRequired')
  const cents = parseCents(draft.amount)
  if (cents === null) return reject('err.amountInvalid')
  if (cents <= 0) return reject('err.amountPositive')
  if (draft.type === 'debt') {
    if (draft.interest === '') return reject('err.interestRequired')
    const interest = parseCents(draft.interest)
    if (interest === null || interest < 0) return reject('err.interestInvalid')
  }

  const movesBetweenAccounts = isTransferLike(draft.type)
  if (movesBetweenAccounts) {
    if (!draft.fromAccount) return reject('err.fromAccountRequired')
    if (!draft.toAccount) return reject('err.toAccountRequired')
  } else if (!draft.account) {
    return reject('err.accountRequired')
  }
  if (!draft.subcategory) return reject('err.subcategoryRequired')

  const tags = tagProblem(normalizeTags(draft.tags), { requireNeedOrWant: draft.type === 'expense' && !draft.isRefund })
  if (tags) return reject(TAG_PROBLEM_ERRORS[tags])

  const problem = movesBetweenAccounts
    ? transferProblem(transferInputOf(draft), ctx)
    : entryProblem(entryOf(draft), ctx)
  return problem ? reject(PROBLEM_MESSAGES[problem]) : { ok: true }
}

const PROBLEM_MESSAGES: Record<EntryProblem, DraftErrorKey> = {
  invalidDate: 'err.invalidDate',
  invalidAmount: 'err.amountInvalid',
  invalidInterest: 'err.interestInvalid',
  interestOnNonLoan: 'err.subcategoryWrongType',
  amountNotPositive: 'err.amountPositive',
  unknownAccount: 'err.accountRequired',
  unknownSubcategory: 'err.subcategoryUnknown',
  subcategoryIsTransfer: 'err.subcategoryWrongType',
  subcategoryNotTransfer: 'err.subcategoryWrongType',
  unexpectedFromTo: 'err.subcategoryWrongType',
  sameAccount: 'err.sameAccount',
  fromMustBeCash: 'err.fromMustBeCash',
  transferToLoan: 'err.transferToLoan',
  debtToNonLoan: 'err.debtToNonLoan',
  wrongDebtAccount: 'err.wrongDebtAccount',
  loanTransfersOnly: 'err.loanTransfersOnly',
  investingNoTransactions: 'err.investingNoTransactions',
  invalidTags: 'err.tagInvalid',
}

// The message for each tag rule, shared by the form and the warning on a transaction row.
export const TAG_PROBLEM_ERRORS: Record<TagProblem, DraftErrorKey> = {
  tooLong: 'err.tagTooLong',
  invalid: 'err.tagInvalid',
  duplicate: 'err.tagsDuplicate',
  tooMany: 'err.tagsTooMany',
  needAndWant: 'err.conflictingTags',
  missingNeedWant: 'err.tagMissing',
}

function transferInputOf(draft: EntryDraft) {
  return {
    date: draft.date,
    merchant: draft.merchant,
    subcategory: draft.subcategory,
    cents: parseCents(draft.amount) ?? 0,
    interestCents: draft.type === 'debt' ? parseCents(draft.interest) ?? 0 : 0,
    note: draft.note,
    tags: normalizeTags(draft.tags),
    from: draft.fromAccount,
    to: draft.toAccount,
  }
}

function entryOf(draft: EntryDraft): LedgerEntry {
  const cents = parseCents(draft.amount) ?? 0
  return {
    account: draft.account,
    date: draft.date,
    merchant: draft.merchant,
    subcategory: draft.subcategory,
    amountCents: signedAmount(draft.type === 'income' ? 'income' : 'expense', cents, draft.isRefund),
    note: draft.note,
    tags: normalizeTags(draft.tags),
    fromTo: '',
  }
}

/** What the ledger saves. Assumes the draft already passed `checkDraft`. */
export function buildDraft(draft: EntryDraft): TransactionDraft {
  return isTransferLike(draft.type)
    ? { kind: 'transfer', input: transferInputOf(draft) }
    : { kind: 'entry', entry: entryOf(draft) }
}
