import { App, Modal } from 'obsidian'
import type { SubcategoryOption } from '../domain/categories'
import { t } from '../labels'

export interface SubcategoryPickRequest {
  title: string
  intro: string
  label: string
  confirmText: string
  emptyText: string // shown instead of the picker when there is nothing to choose from
  targets: SubcategoryOption[]
  onConfirm: (subcategory: string) => Promise<void>
}

// Asks which subcategory to use: where a deleted subcategory's transactions should go, or what
// a selection of transactions should be changed to.
export class SubcategoryPickModal extends Modal {
  constructor(app: App, private request: SubcategoryPickRequest) {
    super(app)
  }

  onOpen() {
    this.containerEl.addClass('ne-scope')
    const { contentEl } = this
    const { title, intro, label, confirmText, emptyText, targets, onConfirm } = this.request
    contentEl.addClass('ne-modal')
    contentEl.createEl('h2', { text: title })

    if (targets.length === 0) {
      contentEl.createEl('p', { text: emptyText })
      const row = contentEl.createDiv('ne-btn-row')
      row.createEl('button', { text: t('ui.cancel') }).addEventListener('click', () => this.close())
      return
    }

    contentEl.createEl('p', { text: intro })
    contentEl.createEl('label', { text: label, cls: 'ne-field-label' })
    const select = contentEl.createEl('select', { cls: 'dropdown' })
    for (const option of targets) {
      select.createEl('option', { text: `${option.category} › ${option.subcategory}`, value: option.subcategory })
    }

    const row = contentEl.createDiv('ne-btn-row')
    const confirm = row.createEl('button', { text: confirmText, cls: 'mod-warning' })
    confirm.addEventListener('click', () => {
      confirm.disabled = true
      this.close()
      void onConfirm(select.value)
    })
    row.createEl('button', { text: t('ui.cancel') }).addEventListener('click', () => this.close())
  }

  onClose() {
    this.contentEl.empty()
  }
}
