import type { App } from 'obsidian'
import type { Account } from '../domain/types'
import { t, tn } from '../labels'
import { LedgerError } from '../services/errors'
import type { Ledger } from '../services/Ledger'
import { accountTransactions } from '../snapshot/snapshot'
import { accountRenameImpact } from '../wizard/model'
import { AccountEditModal } from './AccountEditModal'
import { BalanceCorrectionModal } from './BalanceCorrectionModal'
import { ConfirmModal } from './ConfirmModal'

// Opens the edit modal for an account; `run` executes the resulting ledger change and owns
// refreshing and error reporting, so the wizard and the Accounts tab share this flow.
export function openAccountEdit(
  app: App, ledger: Ledger, account: Account, run: (action: () => Promise<void>) => Promise<void>,
): void {
  const categories = ledger.snapshot.categories
  const options = {
    transferSubcategories: categories.flatMap(c => c.category.subcategories.filter(s => s.type === 'debt').map(s => s.name)),
    // The new payment subcategory goes into the category that already holds transfers or debt payments, else the first one.
    createSubcategory: (name: string) => {
      const home = categories.find(c => c.category.subcategories.some(s => s.type === 'debt' || s.type === 'transfer')) ?? categories[0]
      if (!home) throw new LedgerError(t('err.noTransferCategory'))
      return ledger.categories.addSubcategory(home.category.name, name, 'debt')
    },
  }
  new AccountEditModal(app, account, options, async (change) => {
    const save = () => run(async () => {
      if (change.name !== account.name) await ledger.accounts.rename(account.name, change.name)
      // Every key is passed so that a blank field clears what was stored.
      await ledger.accounts.update(change.name, {
        color: change.color,
        ...(account.accountType === 'loan'
          ? { loanKind: change.loanKind, termMonths: change.termMonths, startDate: change.startDate, interest: change.interest, originalCents: change.originalCents }
          : {}),
        ...(account.accountType === 'loan' ? { paymentSubcategory: change.paymentSubcategory } : {}),
      })
    })
    if (change.name === account.name) { await save(); return }
    const impact = accountRenameImpact(ledger.snapshot, account.name)
    const message = tn('wizard.confirm.renameAccount', {
      from: account.name, to: change.name, files: String(impact.files), transactions: String(impact.transactions),
    })
    new ConfirmModal(app, message, save).open()
  }).open()
}

// The balance has its own flow: it previews and double-checks the result before anything is saved.
export function openBalanceCorrection(
  app: App, ledger: Ledger, account: Account, run: (action: () => Promise<void>) => Promise<void>,
): void {
  const rows = accountTransactions(ledger.snapshot, account.name)
  new BalanceCorrectionModal(app, account, rows, (correction) =>
    run(() => ledger.accounts.update(account.name, correction)),
  ).open()
}
