import { App, Modal, Notice } from 'obsidian'
import { latestValuation } from '../domain/assets'
import { t } from '../labels'
import type { Ledger } from '../services/Ledger'
import { findAsset } from '../snapshot/assetQueries'
import { parseAssetEditForm } from './assetState'
import { renderColorSwatches } from './ColorSwatches'

export class EditAssetModal extends Modal {
  constructor(
    app: App,
    private ledger: Ledger,
    private asset: string,
    // Resolves true when the change was saved, so the modal closes only then.
    private run: (action: () => Promise<void>, notice?: string) => Promise<boolean>,
  ) {
    super(app)
  }

  onOpen() {
    this.containerEl.addClass('ne-scope')
    const { contentEl, containerEl } = this
    const record = findAsset(this.ledger.snapshot, this.asset)
    if (!record) { this.close(); return }
    containerEl.addClass('ne-wallet-edit-modal-container')
    contentEl.addClass('ne-modal')
    contentEl.createEl('h2', { text: t('assets.editTitle') })

    const card = contentEl.createDiv('ne-card ne-add-wallet-card')
    const form = card.createDiv('ne-add-wallet-form')
    const field = (label: string) => {
      const f = form.createDiv('ne-add-wallet-field')
      f.createEl('label', { text: label, cls: 'ne-setting-input-subtitle' })
      return f
    }

    let name = record.asset.name
    let color = record.asset.color

    const nameInput = field(t('assets.name')).createEl('input', { type: 'text', cls: 'ne-add-wallet-input' })
    nameInput.value = name
    nameInput.addEventListener('input', () => { name = nameInput.value.trim() })
    renderColorSwatches(field(t('assets.color')), color, (picked) => { color = picked })

    // The note belongs to a valuation, so this edits the one the card shows: the latest.
    const latest = latestValuation(record.valuations)
    let note = latest?.note ?? ''
    if (latest) {
      const noteInput = field(t('assets.noteLatest')).createEl('input', { type: 'text', cls: 'ne-add-wallet-input' })
      noteInput.value = note
      noteInput.addEventListener('input', () => { note = noteInput.value })
    }

    const submit = async () => {
      const parsed = parseAssetEditForm({ name }, this.ledger.snapshot.assets.map(a => a.asset), this.asset)
      if (!parsed.ok) { new Notice(t(parsed.error)); return }
      const saved = await this.run(async () => {
        // First, while the asset still has its old name: a rename moves the note.
        if (latest && note.trim() !== latest.note) await this.ledger.assets.addValuation(this.asset, { ...latest, note })
        await this.ledger.assets.edit(this.asset, { name: parsed.name, color })
      })
      if (saved) this.close()
    }
    card.createDiv('ne-add-wallet-submit').createEl('button', { text: t('ui.save'), cls: 'mod-cta' })
      .addEventListener('click', () => void submit())
    nameInput.addEventListener('keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); void submit() }
    })
    window.setTimeout(() => { nameInput.focus(); nameInput.select() }, 50)
  }

  onClose() {
    this.containerEl.removeClass('ne-wallet-edit-modal-container')
    this.contentEl.empty()
  }
}
