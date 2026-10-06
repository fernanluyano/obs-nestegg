import { App, Modal } from 'obsidian'
import { t } from '../labels'

// ─── Shared confirm modal ─────────────────────────────────────────────────────

export class ConfirmModal extends Modal {
  private message: string
  private onConfirm: () => void | Promise<void>
  private confirmed = false

  // `onDecline` runs when the modal closes without being confirmed (Cancel or Escape).
  constructor(app: App, message: string, onConfirm: () => void | Promise<void>, private onDecline?: () => void) {
    super(app)
    this.message = message
    this.onConfirm = onConfirm
  }

  onOpen() {
    const { contentEl } = this
    contentEl.createEl('p', { text: this.message })
    const row = contentEl.createDiv('ne-btn-row')
    const confirmBtn = row.createEl('button', { text: t('ui.confirm'), cls: 'mod-warning' })
    confirmBtn.dataset['action'] = 'confirm'
    confirmBtn.addEventListener('click', () => { this.confirmed = true; this.close(); void this.onConfirm() })
    const cancelBtn = row.createEl('button', { text: t('ui.cancel') })
    cancelBtn.dataset['action'] = 'cancel'
    cancelBtn.addEventListener('click', () => this.close())
  }

  onClose() {
    this.contentEl.empty()
    if (!this.confirmed) this.onDecline?.()
  }
}
