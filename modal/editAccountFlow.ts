import type { App } from 'obsidian'
import type { Account } from '../domain/types'
import { tn } from '../labels'
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
  new AccountEditModal(app, account, async (change) => {
    const save = () => run(async () => {
      if (change.name !== account.name) await ledger.accounts.rename(account.name, change.name)
      await ledger.accounts.update(change.name, { color: change.color })
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
