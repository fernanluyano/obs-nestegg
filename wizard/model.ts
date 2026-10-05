import { parseCents } from '../domain/money'
import { miscName } from '../domain/names'
import type { LabelKey } from '../labels'
import { activeAccounts } from '../snapshot/queries'
import type { Snapshot } from '../snapshot/snapshot'

export type WizardStep = 'welcome' | 'accounts' | 'categories' | 'general' | 'done'

export const WIZARD_STEPS: readonly WizardStep[] = ['welcome', 'accounts', 'categories', 'general', 'done']

export function nextStep(step: WizardStep): WizardStep {
  return WIZARD_STEPS[Math.min(WIZARD_STEPS.indexOf(step) + 1, WIZARD_STEPS.length - 1)]
}

export function prevStep(step: WizardStep): WizardStep {
  return WIZARD_STEPS[Math.max(WIZARD_STEPS.indexOf(step) - 1, 0)]
}

export type Advance = { ok: true } | { ok: false; reason: LabelKey; vars?: Record<string, string> }

const activeCashAccounts = (snapshot: Snapshot) => activeAccounts(snapshot).filter(a => a.accountType === 'cash')

// The three mandatory pieces of setup: a cash account, categories that each hold at least one
// subcategory (Misc counts), and a cash account as the default.
export function canAdvance(step: WizardStep, snapshot: Snapshot): Advance {
  if (step === 'accounts' && activeCashAccounts(snapshot).length === 0) return { ok: false, reason: 'wizard.needCashAccount' }
  if (step === 'categories') {
    if (snapshot.categories.length === 0) return { ok: false, reason: 'wizard.needCategory' }
    const empty = snapshot.categories.find(c => c.category.subcategories.length === 0)
    if (empty) return { ok: false, reason: 'wizard.emptyCategory', vars: { name: empty.category.name } }
  }
  if (step === 'general') {
    const wanted = snapshot.settings?.settings.defaultAccount
    if (!activeCashAccounts(snapshot).some(a => a.name === wanted)) return { ok: false, reason: 'wizard.needDefaultCash' }
  }
  return { ok: true }
}

// The settings note is created when the first cash account is added, so while it does not exist
// setup has not been done, and closing the wizard early brings it back at the next start.
export function needsSetup(snapshot: Snapshot): boolean {
  return snapshot.settings === null
}

// The last active cash account can't go away: it is the one account every user must have.
export function canRemoveAccount(snapshot: Snapshot, name: string): Advance {
  const cash = activeCashAccounts(snapshot)
  if (cash.length === 1 && cash[0].name === name) return { ok: false, reason: 'wizard.lastCashAccount' }
  return { ok: true }
}

export type BalanceCheck =
  | { ok: true; cents: number }
  | { ok: false; message: 'err.balanceRequired' | 'err.amountInvalid' | 'err.balanceNegative' }

// The balance must be typed in: blank is rejected, zero is fine.
export function checkBalance(text: string): BalanceCheck {
  if (text.trim() === '') return { ok: false, message: 'err.balanceRequired' }
  const cents = parseCents(text)
  if (cents === null) return { ok: false, message: 'err.amountInvalid' }
  if (cents < 0) return { ok: false, message: 'err.balanceNegative' }
  return { ok: true, cents }
}

export interface RenameImpact {
  files: number        // notes that get rewritten (and possibly moved)
  transactions: number // transactions whose stored text changes or moves with its file
}

function subcategoryImpact(snapshot: Snapshot, subcategory: string, extraFiles: number): RenameImpact {
  let files = extraFiles
  let transactions = 0
  for (const month of snapshot.months) {
    const used = month.transactions.filter(tx => tx.subcategory === subcategory).length
    if (used === 0) continue
    files++
    transactions += used
  }
  return { files, transactions }
}

// The category note itself is rewritten too, hence one extra file.
export function subcategoryRenameImpact(snapshot: Snapshot, subcategory: string): RenameImpact {
  return subcategoryImpact(snapshot, subcategory, 1)
}

// Renaming a category renames its Misc subcategory, so what changes is the Misc rows.
export function categoryRenameImpact(snapshot: Snapshot, category: string): RenameImpact {
  return subcategoryImpact(snapshot, miscName(category), 1)
}

// An account rename rewrites its note, every month file it owns (which move into the new folder),
// the FromTo cells of other accounts' transfers, and the settings note if it is the default.
export function accountRenameImpact(snapshot: Snapshot, account: string): RenameImpact {
  let files = 1
  let transactions = 0
  for (const month of snapshot.months) {
    if (month.account === account) {
      files++
      transactions += month.transactions.length
      continue
    }
    const referencing = month.transactions.filter(tx => tx.fromTo === account).length
    if (referencing === 0) continue
    files++
    transactions += referencing
  }
  if (snapshot.settings?.settings.defaultAccount === account) files++
  return { files, transactions }
}
