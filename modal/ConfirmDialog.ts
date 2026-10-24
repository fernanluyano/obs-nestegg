import { App, Modal } from 'obsidian'
import { t } from '../labels'

type Action = () => void | Promise<void>

// Asks a yes/no question. `onDecline` runs when the dialog closes without being confirmed
// (Cancel, Escape or a click outside).
export class ConfirmDialog extends Modal {
  private wasConfirmed = false

  constructor(
    app: App,
    private readonly question: string,
    private readonly onConfirm: Action,
    private readonly onDecline?: () => void,
  ) {
    super(app)
  }

  onOpen() {
    this.containerEl.addClass('ne-scope')
    const { contentEl } = this
    contentEl.createEl('p', { text: this.question })
    const buttons = contentEl.createDiv('ne-btn-row')

    const yes = buttons.createEl('button', { text: t('ui.confirm'), cls: 'mod-warning' })
    yes.dataset['action'] = 'confirm'
    yes.addEventListener('click', () => {
      this.wasConfirmed = true
      this.close()
      void this.onConfirm()
    })

    const no = buttons.createEl('button', { text: t('ui.cancel') })
    no.dataset['action'] = 'cancel'
    no.addEventListener('click', () => this.close())
  }

  onClose() {
    this.contentEl.empty()
    if (!this.wasConfirmed) this.onDecline?.()
  }
}
