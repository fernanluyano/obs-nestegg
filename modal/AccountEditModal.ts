import { App, Modal, Notice } from 'obsidian'
import { parsePlanFields } from '../domain/accounts'
import { centsToDecimal } from '../domain/money'
import { nameProblem } from '../domain/names'
import { LOAN_KINDS, type Account, type LoanKind } from '../domain/types'
import { t, type LabelKey } from '../labels'
import { renderColorSwatches } from './ColorSwatches'
import { TextPromptModal } from './TextPromptModal'

export interface AccountEdit {
  name: string
  color: string
  // Loan only; the plan fields are undefined when left blank.
  loanKind?: LoanKind
  termMonths?: number
  startDate?: string
  interest?: number
  originalCents?: number
  // Debt accounts only; undefined means no payment category.
  paymentSubcategory?: string
}

export interface AccountEditOptions {
  transferSubcategories: string[]
  // Adds a subcategory under a transfer category, so a payment category can be made on the spot.
  createSubcategory: (name: string) => Promise<void>
}

const NEW_CATEGORY = '\u0000new'

const PLAN_ERRORS: Record<'term' | 'start' | 'interest' | 'original', LabelKey> = {
  term: 'err.loanTermInvalid',
  start: 'err.invalidDate',
  interest: 'err.loanInterestInvalid',
  original: 'err.loanOriginalInvalid',
}

export class AccountEditModal extends Modal {
  private name: string
  private color: string
  private loanKind: LoanKind
  private termMonths: string
  private startDate: string
  private interest: string
  private originalAmount: string
  private paymentSubcategory: string
  private choices: string[]
  private categorySelect!: HTMLSelectElement

  constructor(
    app: App,
    private account: Account,
    private options: AccountEditOptions,
    private onSave: (edit: AccountEdit) => Promise<void>,
  ) {
    super(app)
    this.name = account.name
    this.color = account.color
    this.loanKind = account.loanKind ?? 'other'
    this.termMonths = account.termMonths === undefined ? '' : String(account.termMonths)
    this.startDate = account.startDate ?? ''
    this.interest = account.interest === undefined ? '' : String(account.interest)
    this.originalAmount = account.originalCents === undefined ? '' : centsToDecimal(account.originalCents)
    this.paymentSubcategory = account.paymentSubcategory ?? ''
    this.choices = [...options.transferSubcategories]
  }

  onOpen() {
    this.containerEl.addClass('ne-scope')
    const { contentEl, containerEl } = this
    containerEl.addClass('ne-wallet-edit-modal-container')
    contentEl.addClass('ne-modal')
    contentEl.createEl('h2', { text: t('ui.edit') })

    const form = contentEl.createDiv('ne-wallet-edit-form')
    this.field(form, t('settings.accountName'), 'text', this.name, (v) => { this.name = v.trim() })
    const colorRow = form.createDiv('ne-wallet-edit-field')
    colorRow.createEl('label', { text: t('settings.accountColor'), cls: 'ne-wallet-edit-label' })
    renderColorSwatches(colorRow, this.color, (picked) => { this.color = picked })

    if (this.account.accountType === 'loan') this.renderLoanFields(form)
    if (this.account.accountType === 'loan') this.renderPaymentCategory(form)

    const row = contentEl.createDiv('ne-btn-row')
    const save = row.createEl('button', { text: t('ui.save'), cls: 'mod-cta' })
    save.dataset['action'] = 'save'
    save.addEventListener('click', () => void this.submit())
    const cancel = row.createEl('button', { text: t('ui.cancel') })
    cancel.dataset['action'] = 'cancel'
    cancel.addEventListener('click', () => this.close())
  }

  private renderLoanFields(form: HTMLElement) {
    const kindRow = form.createDiv('ne-wallet-edit-field')
    kindRow.createEl('label', { text: t('settings.loanKind'), cls: 'ne-wallet-edit-label' })
    const kind = kindRow.createEl('select', { cls: 'ne-field-input' })
    for (const k of LOAN_KINDS) kind.createEl('option', { value: k, text: t(`label.loanKind.${k}`) })
    kind.value = this.loanKind
    kind.addEventListener('change', () => { this.loanKind = kind.value as LoanKind })

    this.field(form, t('settings.loanTerm'), 'number', this.termMonths, (v) => { this.termMonths = v })
    this.field(form, t('settings.loanStart'), 'date', this.startDate, (v) => { this.startDate = v })
    this.field(form, t('settings.loanInterest'), 'number', this.interest, (v) => { this.interest = v }, '0.001')
    this.field(form, t('settings.loanOriginal'), 'number', this.originalAmount, (v) => { this.originalAmount = v }, '0.01')
  }

  private renderPaymentCategory(form: HTMLElement) {
    const row = form.createDiv('ne-wallet-edit-field')
    row.createEl('label', { text: t('settings.paymentCategory'), cls: 'ne-wallet-edit-label' })
    this.categorySelect = row.createEl('select', { cls: 'ne-field-input' })
    this.fillCategorySelect()
    this.categorySelect.addEventListener('change', () => {
      if (this.categorySelect.value !== NEW_CATEGORY) { this.paymentSubcategory = this.categorySelect.value; return }
      this.categorySelect.value = this.paymentSubcategory
      this.promptNewCategory()
    })
  }

  private fillCategorySelect() {
    this.categorySelect.empty()
    this.categorySelect.createEl('option', { value: '', text: t('settings.paymentCategoryNone') })
    for (const name of this.choices) this.categorySelect.createEl('option', { value: name, text: name })
    this.categorySelect.createEl('option', { value: NEW_CATEGORY, text: t('settings.paymentCategoryNew') })
    this.categorySelect.value = this.paymentSubcategory
  }

  private promptNewCategory() {
    new TextPromptModal(this.app, t('settings.paymentCategoryPrompt'), '', async (name) => {
      await this.options.createSubcategory(name)
      this.choices.push(name)
      this.paymentSubcategory = name
      this.fillCategorySelect()
    }).open()
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
    const edit: AccountEdit = { name: this.name, color: this.color }
    if (this.account.accountType === 'loan') {
      const plan = parsePlanFields({ termMonths: this.termMonths, startDate: this.startDate, interest: this.interest, originalAmount: this.originalAmount })
      if (!plan.ok) { new Notice(t(PLAN_ERRORS[plan.error])); return }
      Object.assign(edit, { loanKind: this.loanKind, ...plan.fields })
    }
    if (this.account.accountType === 'loan' && this.paymentSubcategory) edit.paymentSubcategory = this.paymentSubcategory
    try {
      await this.onSave(edit)
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
