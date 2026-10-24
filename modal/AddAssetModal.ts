import { App, Modal, Notice } from 'obsidian'
import { ASSET_TYPES, type AssetType } from '../domain/assets'
import { nextAccountColor } from '../domain/colors'
import { todayString } from '../domain/dates'
import { formatCents } from '../domain/money'
import { t, tn } from '../labels'
import type { Ledger } from '../services/Ledger'
import { parseNewAssetForm } from './assetState'
import { renderColorSwatches } from './ColorSwatches'
import { ConfirmDialog } from './ConfirmDialog'

export class AddAssetModal extends Modal {
  constructor(
    app: App,
    private ledger: Ledger,
    // Resolves true when the asset was added, so the modal closes only then and keeps what was typed on a failure.
    private run: (action: () => Promise<void>, notice?: string) => Promise<boolean>,
  ) {
    super(app)
  }

  onOpen() {
    this.containerEl.addClass('ne-scope')
    const { contentEl, containerEl } = this
    containerEl.addClass('ne-wallet-edit-modal-container')
    contentEl.addClass('ne-modal')
    contentEl.createEl('h2', { text: t('assets.add') })

    const card = contentEl.createDiv('ne-card ne-add-wallet-card')
    const form = card.createDiv('ne-add-wallet-form')
    const field = (label: string) => {
      const f = form.createDiv('ne-add-wallet-field')
      f.createEl('label', { text: label, cls: 'ne-setting-input-subtitle' })
      return f
    }

    let name = ''
    let type: AssetType = 'house'
    let value = ''
    let date = todayString()
    let note = ''
    const { snapshot } = this.ledger
    let color = nextAccountColor([...snapshot.accounts.map(a => a.account.color), ...snapshot.assets.map(a => a.asset.color)])

    const nameInput = field(t('assets.name')).createEl('input', { type: 'text', placeholder: t('assets.name'), cls: 'ne-add-wallet-input' })
    nameInput.addEventListener('input', () => { name = nameInput.value.trim() })

    const typeSelect = field(t('assets.type')).createEl('select', { cls: 'ne-add-wallet-input' })
    for (const at of ASSET_TYPES) typeSelect.createEl('option', { value: at, text: t(`label.assetType.${at}`) })
    typeSelect.addEventListener('change', () => { type = typeSelect.value as AssetType })

    const valueInput = field(t('assets.startingValue')).createEl('input', { type: 'number', placeholder: '0.00', cls: 'ne-add-wallet-input' })
    valueInput.setAttribute('step', '0.01')
    valueInput.addEventListener('input', () => { value = valueInput.value })

    const dateInput = field(t('assets.date')).createEl('input', { type: 'date', cls: 'ne-add-wallet-input' })
    dateInput.value = date
    dateInput.addEventListener('change', () => { date = dateInput.value })

    const noteInput = field(t('assets.note')).createEl('input', { type: 'text', cls: 'ne-add-wallet-input' })
    noteInput.addEventListener('input', () => { note = noteInput.value })

    renderColorSwatches(field(t('assets.color')), color, (picked) => { color = picked })

    // Nothing is written until the summary of what will be created has been confirmed.
    const submit = () => {
      const parsed = parseNewAssetForm({ name, valueText: value, date }, snapshot.assets.map(a => a.asset))
      if (!parsed.ok) { new Notice(t(parsed.error)); return }
      const message = tn('assets.confirmAdd', {
        type: t(`label.assetType.${type}`).toLowerCase(), name: parsed.name, value: formatCents(parsed.valueCents), date: parsed.date,
      })
      new ConfirmDialog(this.app, message, async () => {
        const added = await this.run(
          () => this.ledger.assets.create({ name: parsed.name, assetType: type, color, valueCents: parsed.valueCents, date: parsed.date, note }),
          tn('notice.assetAdded', { name: parsed.name }),
        )
        if (added) this.close()
      }).open()
    }
    card.createDiv('ne-add-wallet-submit').createEl('button', { text: t('assets.add'), cls: 'mod-cta' })
      .addEventListener('click', submit)
    for (const el of [nameInput, typeSelect, valueInput]) {
      el.addEventListener('keydown', (e: Event) => {
        if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); submit() }
      })
    }
  }

  onClose() {
    this.containerEl.removeClass('ne-wallet-edit-modal-container')
    this.contentEl.empty()
  }
}
