import { App, Modal, Notice } from 'obsidian'
import { nameProblem } from '../domain/names'
import { t } from '../labels'

// Asks for one name. The caller does the work and may throw; the message is shown in place.
export class TextPromptModal extends Modal {
  private value: string

  constructor(app: App, private title: string, initial: string, private onSubmit: (value: string) => Promise<void>) {
    super(app)
    this.value = initial
  }

  onOpen() {
    this.containerEl.addClass('ne-scope')
    const { contentEl } = this
    contentEl.addClass('ne-modal')
    contentEl.createEl('h2', { text: this.title })
    const input = contentEl.createEl('input', { type: 'text', cls: 'ne-field-input' })
    input.value = this.value
    input.addEventListener('input', () => { this.value = input.value })
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void this.submit() })

    const row = contentEl.createDiv('ne-btn-row')
    row.createEl('button', { text: t('ui.save'), cls: 'mod-cta' }).addEventListener('click', () => void this.submit())
    row.createEl('button', { text: t('ui.cancel') }).addEventListener('click', () => this.close())
    setTimeout(() => { input.focus(); input.select() }, 50)
  }

  private async submit() {
    if (nameProblem(this.value)) { new Notice(t('err.invalidName')); return }
    try {
      await this.onSubmit(this.value)
      this.close()
    } catch (e) {
      new Notice(e instanceof Error ? e.message : String(e))
    }
  }

  onClose() {
    this.contentEl.empty()
  }
}
