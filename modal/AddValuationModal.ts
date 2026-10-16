import { App, Modal, Notice } from 'obsidian'
import { latestValuation } from '../domain/assets'
import { todayString } from '../domain/dates'
import { centsToDecimal } from '../domain/money'
import { t, tn } from '../labels'
import type { Ledger } from '../services/Ledger'
import { findAsset } from '../snapshot/assetQueries'
import { parseValuationForm } from './assetState'

export class AddValuationModal extends Modal {
  constructor(
    app: App,
    private ledger: Ledger,
    private asset: string,
    // Resolves true when the valuation was saved, so the modal closes only then.
    private run: (action: () => Promise<void>, notice?: string) => Promise<boolean>,
  ) {
    super(app)
  }

  onOpen() {
    this.containerEl.addClass('ne-scope')
    const { contentEl, containerEl } = this
    containerEl.addClass('ne-wallet-edit-modal-container')
    contentEl.addClass('ne-modal')
    contentEl.createEl('h2', { text: tn('assets.valuationTitle', { name: this.asset }) })

    const card = contentEl.createDiv('ne-card ne-add-wallet-card')
    const form = card.createDiv('ne-add-wallet-form')
    const field = (label: string) => {
      const f = form.createDiv('ne-add-wallet-field')
      f.createEl('label', { text: label, cls: 'ne-setting-input-subtitle' })
      return f
    }

    // Valuations usually move a little, so the form starts from the last known value.
    const latest = latestValuation(findAsset(this.ledger.snapshot, this.asset)?.valuations ?? [])

    let date = todayString()
    let value = latest ? centsToDecimal(latest.valueCents) : ''
    let note = ''

    const dateInput = field(t('assets.date')).createEl('input', { type: 'date', cls: 'ne-add-wallet-input' })
    dateInput.value = date
    dateInput.addEventListener('change', () => { date = dateInput.value })

    const valueInput = field(t('assets.value')).createEl('input', { type: 'number', placeholder: '0.00', cls: 'ne-add-wallet-input' })
    valueInput.setAttribute('step', '0.01')
    valueInput.value = value
    valueInput.addEventListener('input', () => { value = valueInput.value })

    const noteInput = field(t('assets.note')).createEl('input', { type: 'text', cls: 'ne-add-wallet-input' })
    noteInput.addEventListener('input', () => { note = noteInput.value })

    card.createDiv({ text: t('assets.valuationHint'), cls: 'ne-balance-hint' })

    const submit = async () => {
      const parsed = parseValuationForm({ valueText: value, date })
      if (!parsed.ok) { new Notice(t(parsed.error)); return }
      const saved = await this.run(
        () => this.ledger.assets.addValuation(this.asset, { date: parsed.date, valueCents: parsed.valueCents, note }),
        tn('notice.valuationSaved', { name: this.asset }),
      )
      if (saved) this.close()
    }
    card.createDiv('ne-add-wallet-submit').createEl('button', { text: t('ui.save'), cls: 'mod-cta' })
      .addEventListener('click', () => void submit())
    for (const el of [dateInput, valueInput, noteInput]) {
      el.addEventListener('keydown', (e: Event) => {
        if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); void submit() }
      })
    }
    // Selected, so typing a new value replaces the suggestion.
    setTimeout(() => { valueInput.focus(); valueInput.select() }, 50)
  }

  onClose() {
    this.containerEl.removeClass('ne-wallet-edit-modal-container')
    this.contentEl.empty()
  }
}
