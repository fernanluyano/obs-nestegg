import { App, Modal } from 'obsidian'
import { getChangelogEntry } from '../changelog'
import { t, tn } from '../labels'

export class ChangelogModal extends Modal {
  constructor(app: App, private version: string) {
    super(app)
  }

  onOpen() {
    this.containerEl.addClass('ne-scope')
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('ne-modal')
    contentEl.createEl('h2', { text: tn('changelog.title', { version: this.version }) })
    const entry = getChangelogEntry(this.version)
    if (entry) {
      const list = contentEl.createEl('ul', { cls: 'ne-changelog-list' })
      for (const highlight of entry.highlights) list.createEl('li', { text: highlight })
    } else {
      contentEl.createEl('p', { text: t('changelog.empty') })
    }
    contentEl.createEl('button', { text: t('changelog.close'), cls: 'mod-cta' })
      .addEventListener('click', () => { this.close() })
  }

  onClose() {
    this.contentEl.empty()
  }
}
