import { App, Modal, Notice } from 'obsidian'
import { latestValuation, sortValuations, type Valuation } from '../domain/assets'
import { todayString } from '../domain/dates'
import { centsToDecimal, formatCents } from '../domain/money'
import { t, tn } from '../labels'
import type { Ledger } from '../services/Ledger'
import { findAccount } from '../snapshot/queries'
import { parseValuationForm } from './assetState'
import { ConfirmDialog } from './ConfirmDialog'

// The dated values of one investing account: the list with Edit and Delete on every row, and a
// form that adds a new entry or, after Edit, changes the chosen one.
export class InvestingEntriesModal extends Modal {
  private editing: string | null = null // the date of the entry being edited

  constructor(
    app: App,
    private ledger: Ledger,
    private account: string,
    // Resolves true when the change went through, so the form resets only then.
    private run: (action: () => Promise<void>, notice?: string) => Promise<boolean>,
  ) {
    super(app)
  }

  onOpen() {
    this.containerEl.addClass('ne-scope')
    this.containerEl.addClass('ne-wallet-edit-modal-container')
    this.contentEl.addClass('ne-modal')
    this.render()
  }

  private entries(): Valuation[] {
    return sortValuations(findAccount(this.ledger.snapshot, this.account)?.valuations ?? [])
  }

  private render() {
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl('h2', { text: tn('investing.entriesTitle', { name: this.account }) })

    const entries = this.entries()
    const list = contentEl.createDiv('ne-entries-list')
    for (const entry of [...entries].reverse()) {
      const row = list.createDiv('ne-entries-row' + (entry.date === this.editing ? ' is-editing' : ''))
      const info = row.createDiv('ne-entries-info')
      info.createSpan({ text: entry.date, cls: 'ne-entries-date' })
      info.createSpan({ text: formatCents(entry.valueCents), cls: 'ne-entries-value' })
      if (entry.note) info.createSpan({ text: entry.note, cls: 'ne-entries-note' })
      const actions = row.createDiv('ne-wallet-row-actions')
      actions.createEl('button', { text: t('ui.edit') }).addEventListener('click', () => {
        this.editing = entry.date
        this.render()
      })
      actions.createEl('button', { text: t('ui.delete'), cls: 'mod-warning' })
        .addEventListener('click', () => this.confirmDelete(entry, entries.length))
    }

    this.renderForm(contentEl, entries)
  }

  private confirmDelete(entry: Valuation, count: number) {
    if (count <= 1) { new Notice(t('investing.lastEntry')); return }
    const message = tn('investing.confirmDelete', { date: entry.date, value: formatCents(entry.valueCents), name: this.account })
    new ConfirmDialog(this.app, message, async () => {
      const done = await this.run(() => this.ledger.accounts.removeEntry(this.account, entry.date), tn('notice.entryDeleted', { name: this.account }))
      if (done && this.editing === entry.date) this.editing = null
      this.render()
    }).open()
  }

  private renderForm(parent: HTMLElement, entries: Valuation[]) {
    const original = entries.find(e => e.date === this.editing)
    const card = parent.createDiv('ne-card ne-add-wallet-card')
    card.createDiv({
      text: original ? tn('investing.formEdit', { date: original.date }) : t('investing.formAdd'),
      cls: 'ne-setting-input-subtitle',
    })
    const form = card.createDiv('ne-add-wallet-form')
    const field = (label: string) => {
      const f = form.createDiv('ne-add-wallet-field')
      f.createEl('label', { text: label, cls: 'ne-setting-input-subtitle' })
      return f
    }

    // A new entry starts from the last known value, since a value usually moves a little.
    const latest = latestValuation(entries)
    let date = original?.date ?? todayString()
    let value = original ? centsToDecimal(original.valueCents) : latest ? centsToDecimal(latest.valueCents) : ''
    let note = original?.note ?? ''

    const dateInput = field(t('investing.date')).createEl('input', { type: 'date', cls: 'ne-add-wallet-input' })
    dateInput.value = date
    dateInput.addEventListener('change', () => { date = dateInput.value })

    const valueInput = field(t('investing.value')).createEl('input', { type: 'number', placeholder: '0.00', cls: 'ne-add-wallet-input' })
    valueInput.setAttribute('step', '0.01')
    valueInput.value = value
    valueInput.addEventListener('input', () => { value = valueInput.value })

    const noteInput = field(t('investing.note')).createEl('input', { type: 'text', cls: 'ne-add-wallet-input' })
    noteInput.value = note
    noteInput.addEventListener('input', () => { note = noteInput.value })

    card.createDiv({ text: t('investing.hint'), cls: 'ne-balance-hint' })

    const submit = async () => {
      const parsed = parseValuationForm({ valueText: value, date })
      if (!parsed.ok) { new Notice(t(parsed.error)); return }
      const entry = { date: parsed.date, valueCents: parsed.valueCents, note }
      const saved = await this.run(
        () => original
          ? this.ledger.accounts.editEntry(this.account, original.date, entry)
          : this.ledger.accounts.addEntry(this.account, entry),
        tn('notice.entrySaved', { name: this.account }),
      )
      if (!saved) return
      this.editing = null
      this.render()
    }
    const buttons = card.createDiv('ne-add-wallet-submit')
    buttons.createEl('button', { text: original ? t('ui.save') : t('investing.add'), cls: 'mod-cta' })
      .addEventListener('click', () => void submit())
    if (original) {
      buttons.createEl('button', { text: t('investing.cancelEdit') }).addEventListener('click', () => {
        this.editing = null
        this.render()
      })
    }
    for (const el of [dateInput, valueInput, noteInput]) {
      el.addEventListener('keydown', (e: Event) => {
        if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); void submit() }
      })
    }
  }

  onClose() {
    this.containerEl.removeClass('ne-wallet-edit-modal-container')
    this.contentEl.empty()
  }
}
