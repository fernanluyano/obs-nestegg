import { App, Modal, Notice, setIcon } from 'obsidian'
import { todayString } from '../domain/dates'
import { isTransferLike, type LedgerEntry, type TransactionModalParams, type TransactionType } from '../domain/types'
import { t } from '../labels'
import type { Ledger } from '../services/Ledger'
import { knownMerchants, suggestedTags } from '../snapshot/queries'
import { ConfirmModal } from './ConfirmModal'
import { buildTagInput } from './TagInput'
import {
  accountChoices, buildDraft, categoryChoices, formFromEntry, initialFormState, normalizeTransferForm,
  pendingTagProblem, resetFormForType, transferAccountCandidates, validateTransactionForm, activeAccounts,
  type FormContext, type TransactionFormState,
} from './transactionState'

export class TransactionModal extends Modal {
  protected form: TransactionFormState
  protected errorEl!: HTMLElement
  private fieldsEl!: HTMLElement
  private typeTabsEl!: HTMLElement
  private amountPrefixEl: HTMLElement | null = null
  private busy = false
  private pendingTag = ''

  constructor(
    app: App,
    protected ledger: Ledger,
    params: TransactionModalParams = {},
    protected editing: LedgerEntry | null = null,
    private onSuccess: (() => void) | null = null,
    private onDismiss: (() => void) | null = null,
  ) {
    super(app)
    const ctx = this.context()
    this.form = editing ? formFromEntry(editing, ctx.index) : initialFormState(params, todayString(), ctx)
  }

  protected context(): FormContext {
    const { snapshot } = this.ledger
    return {
      accounts: snapshot.accounts.map(a => a.account),
      categories: snapshot.categories.map(c => c.category),
      index: this.ledger.store.index,
      defaultAccount: this.ledger.settings.current.defaultAccount,
    }
  }

  protected update(patch: Partial<TransactionFormState>) {
    this.form = { ...this.form, ...patch }
  }

  protected changeType(type: TransactionType) {
    this.form = resetFormForType(this.form, type, this.context())
  }

  protected normalizeAccounts() {
    this.form = normalizeTransferForm(this.form, this.context().accounts)
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('ne-modal')

    const titleRow = contentEl.createDiv('ne-modal-title-row')
    const titleEl = titleRow.createEl('h2', { text: this.editing ? t('modal.editTitle') : t('modal.addTitle') })
    if (this.editing) setIcon(titleEl.createSpan('ne-modal-title-icon'), 'pencil')

    this.typeTabsEl = contentEl.createDiv('ne-type-tabs')
    this.renderTypeTabs()
    this.fieldsEl = contentEl.createDiv('ne-fields')
    this.renderFields()

    this.errorEl = contentEl.createDiv('ne-error')
    this.errorEl.hide()
    this.buildButtons(contentEl.createDiv('ne-btn-row'))
    this.bindModalBehavior()
  }

  private buildButtons(row: HTMLElement) {
    const on = (btn: HTMLElement, fn: () => void) => {
      // touchend fires before blur (keyboard dismissal), preventing the double-tap issue on iOS
      btn.addEventListener('touchend', (e) => { e.preventDefault(); fn() })
      btn.addEventListener('click', fn)
    }
    if (this.editing) {
      const del = row.createEl('button', { text: t('ui.delete'), cls: 'ne-btn-delete' })
      del.dataset['action'] = 'delete'
      on(del, () => this.handleDelete())
    }
    const confirm = row.createEl('button', { text: t('ui.confirm'), cls: 'mod-cta' })
    confirm.dataset['action'] = 'confirm'
    on(confirm, () => { void this.handleConfirm() })
    const cancel = row.createEl('button', { text: t('ui.cancel') })
    cancel.dataset['action'] = 'cancel'
    on(cancel, () => this.close())
  }

  private bindModalBehavior() {
    this.modalEl.querySelector<HTMLElement>('.modal-close-button')
      ?.addEventListener('touchend', (e) => { e.preventDefault(); this.close() })
    this.contentEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      this.close()
    })
    // Text inputs raise the keyboard, so the modal moves up; selects and dates lower it again.
    this.contentEl.addEventListener('focusin', (e) => {
      const target = e.target as HTMLElement
      if (target instanceof HTMLInputElement && (target.type === 'text' || target.type === 'number')) {
        this.containerEl.addClass('ne-modal-keyboard-open')
      } else if (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && target.type === 'date')) {
        this.containerEl.removeClass('ne-modal-keyboard-open')
      }
    })
  }

  private renderTypeTabs() {
    this.typeTabsEl.empty()
    const types: TransactionType[] = ['expense', 'income', 'transfer', 'debt']
    for (const type of types) {
      const tab = this.typeTabsEl.createEl('button', {
        text: t(`label.type.${type}`),
        cls: 'ne-type-tab' + (this.form.type === type ? ' is-active' : ''),
      })
      tab.dataset['type'] = type
      const select = () => {
        this.containerEl.removeClass('ne-modal-keyboard-open')
        this.changeType(type)
        this.renderTypeTabs()
        this.renderFields(false)
      }
      tab.addEventListener('touchend', (e) => { e.preventDefault(); select() })
      tab.addEventListener('click', select)
    }
  }

  private renderFields(autoFocus = true) {
    this.fieldsEl.empty()
    this.amountPrefixEl = null
    this.pendingTag = '' // the tag box is rebuilt empty
    const { form } = this
    const ctx = this.context()

    if (form.type === 'expense') this.addRefundRow(this.fieldsEl)

    this.addField(t('modal.date'), () => {
      const input = createEl('input', { type: 'date' })
      input.value = form.date
      input.addEventListener('change', () => this.update({ date: input.value }))
      this.attachPickerTouch(input)
      return input
    })

    this.addField(t('modal.subcategory'), () => this.buildCategorySelect(ctx), true)

    if (isTransferLike(form.type)) {
      const { fromCandidates, toCandidates } = transferAccountCandidates(activeAccounts(ctx.accounts), form)
      this.addField(t('modal.fromAccount'), () => this.buildSelect(fromCandidates.map(a => ({ value: a.name, label: a.name })), form.fromAccount, v => this.update({ fromAccount: v })), true)
      this.addField(t('modal.toAccount'), () => this.buildSelect(toCandidates.map(a => ({ value: a.name, label: a.name })), form.toAccount, v => this.update({ toAccount: v })), true)
    } else {
      this.addField(t('modal.account'), () => this.buildSelect(accountChoices(ctx.accounts, form.type).map(a => ({ value: a.name, label: a.name })), form.account, v => this.update({ account: v })), true)
    }

    this.addField(t('modal.merchant'), () => this.buildMerchantInput())
    this.addField(t('modal.tags'), () => buildTagInput(
      form.tags,
      suggestedTags(this.ledger.snapshot),
      (next) => this.update({ tags: next }),
      (raw) => { this.pendingTag = raw },
    ))
    this.addField(t('modal.note'), () => {
      const input = createEl('input', { type: 'text', placeholder: t('modal.note') })
      input.value = form.note
      input.setAttribute('enterkeyhint', 'done')
      input.addEventListener('input', () => this.update({ note: input.value }))
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur() })
      return input
    })
    this.buildAmountRow(autoFocus)
  }

  private buildCategorySelect(ctx: FormContext): HTMLSelectElement {
    const sel = createEl('select')
    sel.createEl('option', { text: '—', value: '' })
    const groups = new Map<string, HTMLElement>()
    for (const choice of categoryChoices(ctx.categories, this.form.type)) {
      let group = groups.get(choice.category)
      if (!group) {
        group = sel.createEl('optgroup', { attr: { label: choice.category } })
        groups.set(choice.category, group)
      }
      const opt = group.createEl('option', { text: choice.label, value: choice.key })
      if (choice.key === this.form.subcategory) opt.selected = true
    }
    sel.addEventListener('change', () => {
      this.update({ subcategory: sel.value })
      if (isTransferLike(this.form.type)) {
        this.normalizeAccounts()
        this.renderFields(false)
      }
    })
    this.attachPickerTouch(sel)
    return sel
  }

  private buildMerchantInput(): HTMLInputElement {
    const listId = 'ne-merchant-list'
    const input = createEl('input', { type: 'text', placeholder: t('modal.merchant') })
    input.setAttribute('list', listId)
    input.value = this.form.merchant
    input.addEventListener('input', () => this.update({ merchant: input.value }))
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur() })
    const list = this.fieldsEl.createEl('datalist', { attr: { id: listId } })
    for (const merchant of knownMerchants(this.ledger.snapshot)) list.createEl('option', { value: merchant })
    return input
  }

  private buildAmountRow(autoFocus: boolean) {
    const row = this.fieldsEl.createDiv('ne-field-row')
    row.createEl('label', { text: t('modal.amount'), cls: 'ne-field-label' })
    const wrapper = row.createDiv('ne-amount-field-wrapper ne-field-input')
    this.amountPrefixEl = wrapper.createSpan({ cls: 'ne-amount-prefix', text: '+' })
    const input = wrapper.createEl('input', { type: 'number', placeholder: '0.00' })
    input.value = this.form.amount
    input.setAttribute('min', '0')
    input.setAttribute('step', '0.01')
    input.setAttribute('enterkeyhint', 'done')
    input.addEventListener('input', () => {
      this.update({ amount: input.value })
      this.updateAmountPrefix()
    })
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      if (!this.form.amount) input.blur()
      else void this.handleConfirm()
    })
    this.updateAmountPrefix()
    if (autoFocus) setTimeout(() => input.focus(), 50) // wait for modal open animation to complete
  }

  private addField(label: string, buildInput: () => HTMLElement, required = false) {
    const row = this.fieldsEl.createDiv('ne-field-row')
    const labelEl = row.createEl('label', { text: label, cls: 'ne-field-label' })
    if (required) labelEl.createEl('span', { text: '*', cls: 'ne-field-required', attr: { 'aria-hidden': 'true' } })
    const input = buildInput()
    input.addClass('ne-field-input')
    if (input instanceof HTMLSelectElement) row.createDiv('ne-select-wrapper').appendChild(input)
    else row.appendChild(input)
  }

  private addRefundRow(container: HTMLElement) {
    const block = container.createDiv('ne-refund-block')
    const row = block.createDiv('ne-field-row ne-refund-row')
    row.setAttribute('title', t('modal.isRefund.hint'))
    row.createEl('label', { text: t('modal.isRefund'), cls: 'ne-field-label', attr: { for: 'ne-refund-checkbox' } })
    const checkbox = createEl('input', { type: 'checkbox' })
    checkbox.id = 'ne-refund-checkbox'
    checkbox.checked = this.form.isRefund
    checkbox.addClass('ne-field-input')
    checkbox.addEventListener('change', () => {
      this.update({ isRefund: checkbox.checked })
      this.updateAmountPrefix()
    })
    row.appendChild(checkbox)
  }

  private updateAmountPrefix() {
    this.amountPrefixEl?.toggleClass('is-visible', this.form.isRefund && this.form.amount !== '')
  }

  private attachPickerTouch(el: HTMLElement) {
    el.addEventListener('touchstart', () => this.containerEl.removeClass('ne-modal-keyboard-open'), { passive: true })
  }

  private buildSelect(options: { value: string; label: string }[], current: string, onChange: (v: string) => void): HTMLSelectElement {
    const sel = createEl('select')
    sel.createEl('option', { text: '—', value: '' })
    for (const { value, label } of options) {
      const opt = sel.createEl('option', { text: label, value })
      if (value === current) opt.selected = true
    }
    sel.addEventListener('change', () => onChange(sel.value))
    this.attachPickerTouch(sel)
    return sel
  }

  protected showError(msg: string) {
    this.errorEl.textContent = msg
    this.errorEl.show()
  }

  protected clearError() {
    this.errorEl.hide()
  }

  protected handleDelete(): void {
    const entry = this.editing
    if (this.busy || !entry) return
    const text = entry.fromTo ? t('confirm.deleteTransfer') : t('confirm.deleteTransaction')
    new ConfirmModal(this.app, text, async () => {
      await this.run(() => this.ledger.transactions.delete(entry), 'notice.transactionDeleted')
    }).open()
  }

  protected async handleConfirm() {
    if (this.busy) return
    this.clearError()
    const pending = pendingTagProblem(this.form.tags, this.pendingTag)
    if (pending) {
      this.showError(t(pending))
      return
    }
    const result = validateTransactionForm(this.form, this.context())
    if (!result.ok) {
      this.showError(t(result.errorKey))
      return
    }
    const draft = buildDraft(this.form)
    await this.run(
      () => this.ledger.transactions.save(this.editing, draft),
      this.editing ? 'notice.transactionUpdated' : 'notice.transactionAdded',
    )
  }

  private async run(action: () => Promise<void>, notice: 'notice.transactionDeleted' | 'notice.transactionUpdated' | 'notice.transactionAdded') {
    this.busy = true
    try {
      await action()
      this.close()
      this.onSuccess?.()
      new Notice(t(notice))
    } catch (e) {
      this.showError(e instanceof Error ? e.message : String(e))
    } finally {
      this.busy = false
    }
  }

  onClose() {
    this.containerEl.removeClass('ne-modal-keyboard-open')
    this.contentEl.empty()
    this.onDismiss?.()
  }
}
