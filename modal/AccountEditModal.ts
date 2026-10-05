import { App, Modal, Notice } from 'obsidian'
import { centsToDecimal, parseCents } from '../domain/money'
import { nameProblem } from '../domain/names'
import type { Account } from '../domain/types'
import { t } from '../labels'
import { renderColorSwatches } from './ColorSwatches'

export interface AccountEdit {
  name: string
  enteredBalanceCents: number
  enteredBalanceAsOf: string
  color: string
}

export class AccountEditModal extends Modal {
  private name: string
  private balance: string
  private asOf: string
  private color: string

  constructor(app: App, private account: Account, private onSave: (edit: AccountEdit) => Promise<void>) {
    super(app)
    this.name = account.name
    this.balance = centsToDecimal(account.enteredBalanceCents)
    this.asOf = account.enteredBalanceAsOf
    this.color = account.color
  }

  onOpen() {
    const { contentEl, containerEl } = this
    containerEl.addClass('ne-wallet-edit-modal-container')
    contentEl.addClass('ne-modal')
    contentEl.createEl('h2', { text: t('ui.edit') })

    const form = contentEl.createDiv('ne-wallet-edit-form')
    this.field(form, t('settings.accountName'), 'text', this.name, (v) => { this.name = v.trim() })
    this.field(form, t('settings.enteredBalance'), 'number', this.balance, (v) => { this.balance = v }, '0.01')
    this.field(form, t('settings.enteredBalanceAsOf'), 'date', this.asOf, (v) => { this.asOf = v })
    const colorRow = form.createDiv('ne-wallet-edit-field')
    colorRow.createEl('label', { text: t('settings.accountColor'), cls: 'ne-wallet-edit-label' })
    renderColorSwatches(colorRow, this.color, (picked) => { this.color = picked })
    form.createEl('p', {
      text: this.account.accountType === 'creditCard' ? t('settings.creditBalanceHint') : t('settings.cashBalanceHint'),
      cls: 'ne-balance-hint ne-wallet-edit-hint',
    })
    form.createEl('p', { text: t('wizard.accounts.editHint'), cls: 'ne-balance-hint ne-wallet-edit-hint' })

    const row = contentEl.createDiv('ne-btn-row')
    const save = row.createEl('button', { text: t('ui.save'), cls: 'mod-cta' })
    save.dataset['action'] = 'save'
    save.addEventListener('click', () => void this.submit())
    const cancel = row.createEl('button', { text: t('ui.cancel') })
    cancel.dataset['action'] = 'cancel'
    cancel.addEventListener('click', () => this.close())
  }

  private field(parent: HTMLElement, label: string, type: string, value: string, onInput: (v: string) => void, step?: string) {
    const row = parent.createDiv('ne-wallet-edit-field')
    row.createEl('label', { text: label, cls: 'ne-wallet-edit-label' })
    const input = row.createEl('input', { type, cls: 'ne-field-input' })
    if (step) input.setAttribute('step', step)
    input.value = value
    input.setAttribute('enterkeyhint', 'done')
    input.addEventListener('input', () => onInput(input.value))
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur() })
  }

  private async submit() {
    if (!this.name) { new Notice(t('err.accountNameEmpty')); return }
    if (nameProblem(this.name)) { new Notice(t('err.invalidName')); return }
    const cents = parseCents(this.balance)
    if (cents === null) { new Notice(t('err.amountInvalid')); return }
    if (cents < 0) { new Notice(t('err.balanceNegative')); return }
    try {
      await this.onSave({ name: this.name, enteredBalanceCents: cents, enteredBalanceAsOf: this.asOf, color: this.color })
      this.close()
    } catch (e) {
      new Notice(e instanceof Error ? e.message : String(e))
    }
  }

  onClose() {
    this.containerEl.removeClass('ne-wallet-edit-modal-container')
    this.contentEl.empty()
  }
}
