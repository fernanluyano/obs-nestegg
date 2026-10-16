import { App, Modal } from 'obsidian'
import { t } from '../labels'
import type { Ledger } from '../services/Ledger'
import { renderAddAccountForm } from '../view/accounts/addAccountForm'

export class AddAccountModal extends Modal {
  constructor(
    app: App,
    private ledger: Ledger,
    // Resolves true when the account was added, so the modal closes only then and keeps what was typed on a failure.
    private run: (action: () => Promise<void>, notice?: string) => Promise<boolean>,
  ) {
    super(app)
  }

  onOpen() {
    this.containerEl.addClass('ne-scope')
    const { contentEl, containerEl } = this
    containerEl.addClass('ne-wallet-edit-modal-container')
    contentEl.addClass('ne-modal')
    contentEl.createEl('h2', { text: t('settings.addAccount') })
    renderAddAccountForm(contentEl, {
      app: this.app,
      ledger: this.ledger,
      run: async (action, notice) => { if (await this.run(action, notice)) this.close() },
    })
  }

  onClose() {
    this.containerEl.removeClass('ne-wallet-edit-modal-container')
    this.contentEl.empty()
  }
}
