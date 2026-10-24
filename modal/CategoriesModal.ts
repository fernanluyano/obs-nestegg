import { App, EventRef, Events, Modal } from 'obsidian'
import { t } from '../labels'
import type { Ledger } from '../services/Ledger'
import { renderCategoriesEditor } from '../view/budget/categoriesEditor'

// Every edit refreshes the views, so the modal redraws itself from the latest snapshot on the
// same event instead of being closed and reopened.
export class CategoriesModal extends Modal {
  private ref: EventRef | null = null
  private bodyEl!: HTMLElement

  constructor(app: App, private ledger: Ledger) {
    super(app)
  }

  onOpen() {
    this.containerEl.addClass('ne-scope', 'ne-categories-container')
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('ne-modal')
    contentEl.createEl('h2', { text: t('wizard.categories.title') })
    this.bodyEl = contentEl.createDiv('ne-categories-body')
    this.render()
    this.ref = (this.app.workspace as Events).on('nestegg:refresh', () => { this.render() })
  }

  private render() {
    const scroll = this.bodyEl.scrollTop
    this.bodyEl.empty()
    renderCategoriesEditor(this.bodyEl, { app: this.app, ledger: this.ledger })
    this.bodyEl.scrollTop = scroll
  }

  onClose() {
    if (this.ref) (this.app.workspace as Events).offref(this.ref)
    this.containerEl.removeClass('ne-categories-container')
    this.contentEl.empty()
  }
}
