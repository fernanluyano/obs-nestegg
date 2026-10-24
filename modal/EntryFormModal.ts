import { App, Modal, Notice, setIcon } from 'obsidian'
import { todayString } from '../domain/dates'
import { isTransferLike, type LedgerEntry, type TransactionModalParams, type TransactionType } from '../domain/types'
import { formatCents, parseCents } from '../domain/money'
import { t, tn } from '../labels'
import type { Ledger } from '../services/Ledger'
import { knownMerchants, suggestedTags } from '../snapshot/queries'
import { ConfirmDialog } from './ConfirmDialog'
import { createTagField } from './TagField'
import {
  accountChoices, buildDraft, categoryChoices, formFromEntry, initialFormState, normalizeTransferForm,
  pendingTagProblem, resetFormForType, transferAccountCandidates, checkDraft, activeAccounts,
  type FormContext, type EntryDraft,
} from './entryDraft'

const TYPE_ORDER: TransactionType[] = ['expense', 'income', 'transfer', 'debt']
const KEYBOARD_OPEN_CLASS = 'ne-modal-keyboard-open'
const FOCUS_DELAY_MS = 50

type Outcome = 'notice.transactionDeleted' | 'notice.transactionUpdated' | 'notice.transactionAdded'

interface SelectItem {
  value: string
  label: string
}

const accountItems = (accounts: { name: string }[]): SelectItem[] => accounts.map(a => ({ value: a.name, label: a.name }))

// The desktop form for adding or editing one transaction; the mobile modal extends it.
export class EntryFormModal extends Modal {
  protected draft: EntryDraft
  protected errorLine!: HTMLElement
  protected totalLine: HTMLElement | null = null
  private fieldsBox!: HTMLElement
  private tabStrip!: HTMLElement
  private plusSign: HTMLElement | null = null
  private working = false
  private untypedTag = ''

  constructor(
    app: App,
    protected ledger: Ledger,
    preset: TransactionModalParams = {},
    protected target: LedgerEntry | null = null,
    private afterSave: (() => void) | null = null,
    private afterClose: (() => void) | null = null,
  ) {
    super(app)
    const context = this.formContext()
    this.draft = target
      ? formFromEntry(target, context.index, ledger.transactions.partnerOf(target))
      : initialFormState(preset, todayString(), context)
  }

  protected formContext(): FormContext {
    const { snapshot } = this.ledger
    return {
      accounts: snapshot.accounts.map(record => record.account),
      categories: snapshot.categories.map(record => record.category),
      index: this.ledger.store.index,
      defaultAccount: this.ledger.settings.current.defaultAccount,
    }
  }

  protected patch(changes: Partial<EntryDraft>) {
    this.draft = { ...this.draft, ...changes }
  }

  protected switchType(type: TransactionType) {
    this.draft = resetFormForType(this.draft, type, this.formContext())
  }

  protected reconcileAccounts() {
    this.draft = normalizeTransferForm(this.draft, this.formContext().accounts)
  }

  onOpen() {
    this.containerEl.addClass('ne-scope')
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass('ne-modal')

    const header = contentEl.createDiv('ne-modal-title-row')
    const heading = header.createEl('h2', { text: this.target ? t('modal.editTitle') : t('modal.addTitle') })
    if (this.target) setIcon(heading.createSpan('ne-modal-title-icon'), 'pencil')

    this.tabStrip = contentEl.createDiv('ne-type-tabs')
    this.drawTabs()
    this.fieldsBox = contentEl.createDiv('ne-fields')
    this.drawFields()

    this.errorLine = contentEl.createDiv('ne-error')
    this.errorLine.hide()
    this.addButtons(contentEl.createDiv('ne-btn-row'))
    this.wireModal()
  }

  private addButtons(row: HTMLElement) {
    // touchend fires before blur (keyboard dismissal), which avoids a double tap on iOS.
    const onPress = (button: HTMLElement, action: () => void) => {
      button.addEventListener('touchend', (event) => { event.preventDefault(); action() })
      button.addEventListener('click', action)
    }
    if (this.target) {
      const remove = row.createEl('button', { text: t('ui.delete'), cls: 'ne-btn-delete' })
      remove.dataset['action'] = 'delete'
      onPress(remove, () => this.confirmDelete())
    }
    const save = row.createEl('button', { text: t('ui.confirm'), cls: 'mod-cta' })
    save.dataset['action'] = 'confirm'
    onPress(save, () => { void this.submit() })
    const dismiss = row.createEl('button', { text: t('ui.cancel') })
    dismiss.dataset['action'] = 'cancel'
    onPress(dismiss, () => this.close())
  }

  private wireModal() {
    this.modalEl.querySelector<HTMLElement>('.modal-close-button')
      ?.addEventListener('touchend', (event) => { event.preventDefault(); this.close() })
    this.contentEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      this.close()
    })
    // Text inputs raise the keyboard, so the modal moves up; selects and dates lower it again.
    this.contentEl.addEventListener('focusin', (event) => {
      const focused = event.target as HTMLElement
      if (focused instanceof HTMLInputElement && (focused.type === 'text' || focused.type === 'number')) {
        this.containerEl.addClass(KEYBOARD_OPEN_CLASS)
      } else if (focused instanceof HTMLSelectElement || (focused instanceof HTMLInputElement && focused.type === 'date')) {
        this.containerEl.removeClass(KEYBOARD_OPEN_CLASS)
      }
    })
  }

  private drawTabs() {
    this.tabStrip.empty()
    for (const type of TYPE_ORDER) {
      const tab = this.tabStrip.createEl('button', {
        text: t(`label.type.${type}`),
        cls: 'ne-type-tab' + (this.draft.type === type ? ' is-active' : ''),
      })
      tab.dataset['type'] = type
      const choose = () => {
        this.containerEl.removeClass(KEYBOARD_OPEN_CLASS)
        this.switchType(type)
        this.drawTabs()
        this.drawFields(false)
      }
      tab.addEventListener('touchend', (event) => { event.preventDefault(); choose() })
      tab.addEventListener('click', choose)
    }
  }

  private drawFields(focusAmount = true) {
    this.fieldsBox.empty()
    this.plusSign = null
    this.totalLine = null
    this.untypedTag = '' // the tag box is rebuilt empty
    const { draft } = this
    const context = this.formContext()

    if (draft.type === 'expense') this.addRefundToggle(this.fieldsBox)

    this.addLabelled(t('modal.date'), () => {
      const input = createEl('input', { type: 'date' })
      input.value = draft.date
      input.addEventListener('change', () => this.patch({ date: input.value }))
      this.dismissKeyboardOnTouch(input)
      return input
    })

    this.addLabelled(t('modal.subcategory'), () => this.categorySelect(context), true)

    if (isTransferLike(draft.type)) {
      const { fromCandidates, toCandidates } = transferAccountCandidates(activeAccounts(context.accounts), draft)
      this.addLabelled(t('modal.fromAccount'), () => this.selectFrom(accountItems(fromCandidates), draft.fromAccount, value => this.patch({ fromAccount: value })), true)
      this.addLabelled(t('modal.toAccount'), () => this.selectFrom(accountItems(toCandidates), draft.toAccount, value => this.patch({ toAccount: value })), true)
    } else {
      this.addLabelled(t('modal.account'), () => this.selectFrom(accountItems(accountChoices(context.accounts, draft.type)), draft.account, value => this.patch({ account: value })), true)
    }

    this.addLabelled(t('modal.merchant'), () => this.merchantInput())
    this.addLabelled(t('modal.tags'), () => createTagField(
      draft.tags,
      suggestedTags(this.ledger.snapshot),
      (next) => this.patch({ tags: next }),
      (raw) => { this.untypedTag = raw },
    ))
    this.addLabelled(t('modal.note'), () => {
      const input = createEl('input', { type: 'text', placeholder: t('modal.note') })
      input.value = draft.note
      input.setAttribute('enterkeyhint', 'done')
      input.addEventListener('input', () => this.patch({ note: input.value }))
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') input.blur() })
      return input
    })
    this.addAmountRow(focusAmount)
  }

  private categorySelect(context: FormContext): HTMLSelectElement {
    const select = createEl('select')
    select.createEl('option', { text: '—', value: '' })
    const groups = new Map<string, HTMLElement>()
    for (const choice of categoryChoices(context.categories, this.draft.type)) {
      let group = groups.get(choice.category)
      if (!group) {
        group = select.createEl('optgroup', { attr: { label: choice.category } })
        groups.set(choice.category, group)
      }
      const option = group.createEl('option', { text: choice.label, value: choice.key })
      if (choice.key === this.draft.subcategory) option.selected = true
    }
    select.addEventListener('change', () => {
      this.patch({ subcategory: select.value })
      if (isTransferLike(this.draft.type)) {
        this.reconcileAccounts()
        this.drawFields(false)
      }
    })
    this.dismissKeyboardOnTouch(select)
    return select
  }

  private merchantInput(): HTMLInputElement {
    const listId = 'ne-merchant-list'
    const input = createEl('input', { type: 'text', placeholder: t('modal.merchant') })
    input.setAttribute('list', listId)
    input.value = this.draft.merchant
    input.addEventListener('input', () => this.patch({ merchant: input.value }))
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') input.blur() })
    const suggestions = this.fieldsBox.createEl('datalist', { attr: { id: listId } })
    for (const merchant of knownMerchants(this.ledger.snapshot)) suggestions.createEl('option', { value: merchant })
    return input
  }

  // A loan payment has two amounts: the principal, which lowers the loan, and the interest on top of it.
  private addInterestRow() {
    const row = this.fieldsBox.createDiv('ne-field-row')
    row.createEl('label', { text: t('modal.interest'), cls: 'ne-field-label' })
    const holder = row.createDiv('ne-amount-field-wrapper ne-field-input')
    const input = holder.createEl('input', { type: 'number', placeholder: '0.00' })
    input.value = this.draft.interest
    input.setAttribute('min', '0')
    input.setAttribute('step', '0.01')
    input.setAttribute('enterkeyhint', 'done')
    input.addEventListener('input', () => {
      this.patch({ interest: input.value })
      this.refreshTotalPaid()
    })
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      void this.submit()
    })
    this.totalLine = this.fieldsBox.createDiv({ cls: 'ne-field-hint' })
    this.refreshTotalPaid()
  }

  protected refreshTotalPaid() {
    if (!this.totalLine) return
    const principal = parseCents(this.draft.amount)
    const interest = parseCents(this.draft.interest)
    const both = principal !== null && interest !== null
    this.totalLine.setText(both ? tn('modal.totalPaid', { total: formatCents(principal + interest) }) : '')
  }

  private addAmountRow(focusAmount: boolean) {
    const row = this.fieldsBox.createDiv('ne-field-row')
    row.createEl('label', { text: this.draft.type === 'debt' ? t('modal.principal') : t('modal.amount'), cls: 'ne-field-label' })
    const holder = row.createDiv('ne-amount-field-wrapper ne-field-input')
    this.plusSign = holder.createSpan({ cls: 'ne-amount-prefix', text: '+' })
    const input = holder.createEl('input', { type: 'number', placeholder: '0.00' })
    input.value = this.draft.amount
    input.setAttribute('min', '0')
    input.setAttribute('step', '0.01')
    input.setAttribute('enterkeyhint', 'done')
    input.addEventListener('input', () => {
      this.patch({ amount: input.value })
      this.refreshPlusSign()
      this.refreshTotalPaid()
    })
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      if (!this.draft.amount) input.blur()
      else void this.submit()
    })
    this.refreshPlusSign()
    if (this.draft.type === 'debt') this.addInterestRow()
    if (focusAmount) setTimeout(() => input.focus(), FOCUS_DELAY_MS) // wait for the modal open animation
  }

  private addLabelled(label: string, buildControl: () => HTMLElement, required = false) {
    const row = this.fieldsBox.createDiv('ne-field-row')
    const caption = row.createEl('label', { text: label, cls: 'ne-field-label' })
    if (required) caption.createEl('span', { text: '*', cls: 'ne-field-required', attr: { 'aria-hidden': 'true' } })
    const control = buildControl()
    control.addClass('ne-field-input')
    if (control instanceof HTMLSelectElement) row.createDiv('ne-select-wrapper').appendChild(control)
    else row.appendChild(control)
  }

  private addRefundToggle(parent: HTMLElement) {
    const block = parent.createDiv('ne-refund-block')
    const row = block.createDiv('ne-field-row ne-refund-row')
    row.setAttribute('title', t('modal.isRefund.hint'))
    row.createEl('label', { text: t('modal.isRefund'), cls: 'ne-field-label', attr: { for: 'ne-refund-checkbox' } })
    const toggle = createEl('input', { type: 'checkbox' })
    toggle.id = 'ne-refund-checkbox'
    toggle.checked = this.draft.isRefund
    toggle.addClass('ne-field-input')
    toggle.addEventListener('change', () => {
      this.patch({ isRefund: toggle.checked })
      this.refreshPlusSign()
    })
    row.appendChild(toggle)
  }

  private refreshPlusSign() {
    this.plusSign?.toggleClass('is-visible', this.draft.isRefund && this.draft.amount !== '')
  }

  private dismissKeyboardOnTouch(control: HTMLElement) {
    control.addEventListener('touchstart', () => this.containerEl.removeClass(KEYBOARD_OPEN_CLASS), { passive: true })
  }

  private selectFrom(items: SelectItem[], chosen: string, onChange: (value: string) => void): HTMLSelectElement {
    const select = createEl('select')
    select.createEl('option', { text: '—', value: '' })
    for (const { value, label } of items) {
      const option = select.createEl('option', { text: label, value })
      if (value === chosen) option.selected = true
    }
    select.addEventListener('change', () => onChange(select.value))
    this.dismissKeyboardOnTouch(select)
    return select
  }

  protected showProblem(message: string) {
    this.errorLine.textContent = message
    this.errorLine.show()
  }

  protected clearProblem() {
    this.errorLine.hide()
  }

  protected confirmDelete(): void {
    const entry = this.target
    if (this.working || !entry) return
    const question = entry.fromTo ? t('confirm.deleteTransfer') : t('confirm.deleteTransaction')
    new ConfirmDialog(this.app, question, async () => {
      await this.perform(() => this.ledger.transactions.delete(entry), 'notice.transactionDeleted')
    }).open()
  }

  protected async submit() {
    if (this.working) return
    this.clearProblem()
    const tagProblem = pendingTagProblem(this.draft.tags, this.untypedTag)
    if (tagProblem) {
      this.showProblem(t(tagProblem))
      return
    }
    const verdict = checkDraft(this.draft, this.formContext())
    if (!verdict.ok) {
      this.showProblem(t(verdict.errorKey))
      return
    }
    const entry = buildDraft(this.draft)
    await this.perform(
      () => this.ledger.transactions.save(this.target, entry),
      this.target ? 'notice.transactionUpdated' : 'notice.transactionAdded',
    )
  }

  private async perform(action: () => Promise<void>, outcome: Outcome) {
    this.working = true
    try {
      await action()
      this.close()
      this.afterSave?.()
      new Notice(t(outcome))
    } catch (error) {
      this.showProblem(error instanceof Error ? error.message : String(error))
    } finally {
      this.working = false
    }
  }

  onClose() {
    this.containerEl.removeClass(KEYBOARD_OPEN_CLASS)
    this.contentEl.empty()
    this.afterClose?.()
  }
}
