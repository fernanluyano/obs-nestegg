import { setIcon } from 'obsidian'
import { isTransferLike, type TransactionType } from '../domain/types'
import { t } from '../labels'
import { knownMerchants, suggestedTags } from '../snapshot/queries'
import { EntryFormModal } from './EntryFormModal'
import { heroAmountLabel } from '../helpers'
import { accountChoices, activeAccounts, categoryChoices, transferAccountCandidates } from './entryDraft'
import { openChoiceSheet, openSheetFrame, type SheetChoice } from './SlideUpSheet'
import { openTagSheet } from './TagSheet'
import { AmountKeypad } from './AmountKeypad'
import { newKeypadState, pressKeypadKey, type KeypadKey, type KeypadState } from './keypadState'

const TYPE_ORDER: TransactionType[] = ['expense', 'income', 'transfer', 'debt']
const BLANK = '—'
const KEYBOARD_MIN_HEIGHT_PX = 50
const SELECTOR_TEXT_FIELDS = '.ne-phone-note-input, .ne-sheet-search, .ne-tag-sheet-add-input'

const nameChoices = (accounts: { name: string }[]): SheetChoice[] => accounts.map(a => ({ key: a.name, label: a.name }))

// A button that reacts to touchend straight away and ignores the click that follows it.
function onTap(button: HTMLElement, action: () => void): void {
  let touched = false
  button.addEventListener('touchend', (event) => { event.preventDefault(); touched = true; action() })
  button.addEventListener('click', () => {
    if (touched) { touched = false; return }
    action()
  })
}

// The phone layout of the transaction form: big amount on top, one tappable row per field, and
// sheets sliding up for the pickers and the keypad.
export class MobileEntryFormModal extends EntryFormModal {
  private tabBar!: HTMLElement
  private rowsBox!: HTMLElement
  private heroAmount!: HTMLElement
  private keypadState: KeypadState = newKeypadState()
  private keypad: AmountKeypad | null = null
  private dismissKeypad: (() => void) | null = null
  private keypadTitle: HTMLElement | null = null
  private viewportListeners: (() => void)[] = []

  onOpen() {
    this.containerEl.addClass('ne-scope')
    this.buildScreen()
    // iOS focuses the first button on open; blur it once the animation is over.
    window.setTimeout(() => (document.activeElement as HTMLElement)?.blur(), 100)
  }

  private buildScreen() {
    const { contentEl, containerEl } = this
    contentEl.empty()
    contentEl.addClass('ne-phone-content')
    containerEl.addClass('ne-entry-form-container')

    const topBar = contentEl.createDiv('ne-phone-top-bar')
    const closeButton = topBar.createEl('button', { cls: 'ne-phone-top-btn', text: '✕' })
    const title = topBar.createSpan({
      cls: 'ne-phone-top-title',
      text: this.target ? t('modal.editTitle') : t('modal.addTitle'),
    })
    if (this.target) setIcon(title.createSpan('ne-modal-title-icon'), 'pencil')
    const saveButton = topBar.createEl('button', {
      cls: 'ne-phone-top-btn ne-phone-top-confirm',
      text: '✓',
    })
    onTap(closeButton, () => this.close())
    onTap(saveButton, () => { void this.submit() })

    this.tabBar = contentEl.createDiv('ne-phone-tabs')
    this.drawTabBar()

    const amountArea = contentEl.createDiv('ne-phone-amount-area')
    amountArea.setAttribute('role', 'button')
    amountArea.tabIndex = 0
    amountArea.addEventListener('click', () => this.openKeypad())
    amountArea.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      this.openKeypad()
    })
    this.heroAmount = amountArea.createDiv('ne-phone-amount-display')
    this.keypadState = newKeypadState(this.draft.amount)
    this.refreshHeroAmount()

    this.errorLine = contentEl.createDiv('ne-error ne-phone-error')
    this.errorLine.hide()

    // The delete row, when editing, is added at the end of drawRows.
    this.rowsBox = contentEl.createDiv('ne-phone-rows')
    this.drawRows()

    this.trackTextFocus()
  }

  private trackTextFocus() {
    const isTextField = (node: Node | null): node is HTMLElement =>
      node !== null && node.instanceOf(HTMLElement) && node.matches(SELECTOR_TEXT_FIELDS)

    this.contentEl.addEventListener('focusin', (event) => {
      if (isTextField(event.target as Node | null)) this.contentEl.addClass('ne-phone-text-focus')
    })

    this.contentEl.addEventListener('focusout', () => {
      window.setTimeout(() => {
        if (!isTextField(document.activeElement)) this.contentEl.removeClass('ne-phone-text-focus')
      }, 0)
    })

    const viewport = window.visualViewport
    if (viewport) {
      const host = this.contentEl
      const syncKeyboardHeight = () => {
        const covered = Math.max(0, window.innerHeight - viewport.height)
        if (covered > KEYBOARD_MIN_HEIGHT_PX) host.style.setProperty('--ne-keyboard-h', `${covered}px`)
        else host.style.removeProperty('--ne-keyboard-h')
      }
      viewport.addEventListener('resize', syncKeyboardHeight)
      this.viewportListeners.push(() => window.visualViewport?.removeEventListener('resize', syncKeyboardHeight))
    }
  }

  private drawTabBar() {
    this.tabBar.empty()
    for (const type of TYPE_ORDER) {
      const tab = this.tabBar.createEl('button', {
        text: t(`label.type.${type}`),
        cls: 'ne-phone-tab' + (this.draft.type === type ? ' is-active' : ''),
      })
      tab.addEventListener('click', () => {
        this.switchType(type)
        this.drawTabBar()
        this.drawRows()
      })
    }
  }

  private addInterestEntry() {
    const row = this.rowsBox.createDiv('ne-phone-row')
    row.createEl('label', { cls: 'ne-phone-row-label', text: t('modal.interest') })
    const input = row.createEl('input', { type: 'text', cls: 'ne-phone-note-input', placeholder: '0.00' })
    input.inputMode = 'decimal'
    input.value = this.draft.interest
    input.addEventListener('input', () => {
      this.patch({ interest: input.value })
      this.refreshTotalPaid()
    })
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') input.blur() })
    this.totalLine = this.rowsBox.createDiv({ cls: 'ne-phone-refund-hint-row' })
    this.refreshTotalPaid()
  }

  private drawRows() {
    this.rowsBox.empty()
    const context = this.formContext()
    const { draft } = this
    const movesBetweenAccounts = isTransferLike(draft.type)

    // The refund toggle comes first (expenses only): it is a sub-option of the type tab above it.
    if (draft.type === 'expense') {
      const block = this.rowsBox.createDiv('ne-refund-block')
      const toggleRow = block.createDiv('ne-phone-row ne-phone-refund-row')
      const toggleId = 'ne-phone-refund-checkbox'
      toggleRow.createEl('label', { cls: 'ne-phone-row-label', text: t('modal.isRefund'), attr: { for: toggleId } })
      const toggle = toggleRow.createEl('input', { type: 'checkbox' })
      toggle.id = toggleId
      toggle.checked = draft.isRefund
      toggle.addEventListener('change', () => {
        this.patch({ isRefund: toggle.checked })
        this.refreshHeroAmount()
      })
      block.createDiv({ cls: 'ne-phone-refund-hint-row', text: t('modal.isRefund.hint') })
    }

    // A loan payment has a second amount: the hero amount is the principal, this row the interest.
    if (draft.type === 'debt') this.addInterestEntry()

    let dateField!: HTMLInputElement
    this.addPickerRow(
      this.rowsBox, t('modal.date'), this.formatDate(),
      (shown) => {
        dateField = createEl('input', { type: 'date' })
        dateField.value = draft.date
        dateField.addClass('ne-hidden-date-trigger')
        dateField.addEventListener('change', () => {
          this.patch({ date: dateField.value })
          shown.textContent = this.formatDate()
        })
        return dateField
      },
      () => dateField.focus(),
    ).addClass('ne-phone-date-row')

    const subcategories = categoryChoices(context.categories, draft.type)
    this.addChoiceRow(
      this.rowsBox,
      t('modal.subcategory'),
      draft.subcategory || BLANK,
      this.withBlankChoice(subcategories.map(c => ({ key: c.key, label: `${c.category} › ${c.label}` }))),
      () => this.draft.subcategory,
      (key) => {
        this.patch({ subcategory: key })
        if (movesBetweenAccounts) {
          this.reconcileAccounts()
          this.drawRows()
        }
      },
      true,
    )

    if (movesBetweenAccounts) {
      const { fromCandidates, toCandidates } = transferAccountCandidates(activeAccounts(context.accounts), draft)
      this.addChoiceRow(
        this.rowsBox, t('modal.fromAccount'), draft.fromAccount || BLANK,
        this.withBlankChoice(nameChoices(fromCandidates)),
        () => this.draft.fromAccount, (key) => this.patch({ fromAccount: key }), true,
      )
      this.addChoiceRow(
        this.rowsBox, t('modal.toAccount'), draft.toAccount || BLANK,
        this.withBlankChoice(nameChoices(toCandidates)),
        () => this.draft.toAccount, (key) => this.patch({ toAccount: key }), true,
      )
    } else {
      this.addChoiceRow(
        this.rowsBox, t('modal.account'), draft.account || BLANK,
        this.withBlankChoice(nameChoices(accountChoices(context.accounts, draft.type))),
        () => this.draft.account, (key) => this.patch({ account: key }), true,
      )
    }

    // Merchant: free text, with the known merchants offered as suggestions.
    const merchantRow = this.rowsBox.createDiv('ne-phone-row')
    merchantRow.createSpan({ cls: 'ne-phone-row-label', text: t('modal.merchant') })
    const merchantField = merchantRow.createEl('input', {
      type: 'text', cls: 'ne-phone-note-input', placeholder: t('modal.merchant'),
    })
    merchantField.setAttribute('list', 'ne-phone-merchant-list')
    merchantField.setAttribute('enterkeyhint', 'done')
    merchantField.value = draft.merchant
    const merchantSuggestions = merchantRow.createEl('datalist', { attr: { id: 'ne-phone-merchant-list' } })
    for (const merchant of knownMerchants(this.ledger.snapshot)) merchantSuggestions.createEl('option', { value: merchant })
    merchantField.addEventListener('focus', () => this.closeKeypad())
    merchantField.addEventListener('input', () => this.patch({ merchant: merchantField.value }))
    merchantField.addEventListener('keydown', (event) => { if (event.key === 'Enter') merchantField.blur() })

    // Tags: the chips (or a placeholder) in one row; a tap anywhere on it opens the multi-select sheet.
    const tagRow = this.rowsBox.createDiv('ne-phone-row')
    tagRow.dataset['testid'] = 'mobile-tag-row'
    tagRow.createSpan({ cls: 'ne-phone-row-label', text: t('modal.tags') })
    const tagHolder = tagRow.createDiv('ne-tag-input-wrapper')
    const tagChips = tagHolder.createDiv('ne-phone-tag-chips')
    tagChips.dataset['testid'] = 'mobile-tag-chips'

    const drawTagChips = () => {
      tagChips.empty()
      if (this.draft.tags.length === 0) {
        tagChips.createSpan({ cls: 'ne-phone-tag-row-placeholder', text: t('tagSheet.rowPlaceholder') })
        return
      }
      for (const tag of this.draft.tags) {
        const chip = tagChips.createSpan({ cls: 'ne-phone-tag-chip', text: `#${tag}` })
        chip.dataset['testid'] = 'mobile-tag-chip'
        chip.dataset['tag'] = tag
      }
    }

    tagRow.addEventListener('click', () => {
      this.closeKeypad()
      openTagSheet({
        containerEl: this.contentEl,
        availableTags: suggestedTags(this.ledger.snapshot),
        initialSelected: this.draft.tags,
        onCommit: (selected) => {
          this.patch({ tags: selected })
          drawTagChips()
        },
      })
    })

    drawTagChips()

    const noteRow = this.rowsBox.createDiv('ne-phone-row')
    noteRow.createSpan({ cls: 'ne-phone-row-label', text: t('modal.note') })
    const noteField = noteRow.createEl('input', {
      type: 'text',
      cls: 'ne-phone-note-input',
      placeholder: t('modal.note'),
    })
    noteField.value = this.draft.note
    noteField.setAttribute('enterkeyhint', 'done')
    noteField.addEventListener('focus', () => this.closeKeypad())
    noteField.addEventListener('input', () => this.patch({ note: noteField.value }))
    noteField.addEventListener('keydown', (event) => { if (event.key === 'Enter') noteField.blur() })

    this.addDeleteRow()
  }

  private addDeleteRow() {
    if (!this.target) return
    const zone = this.rowsBox.createDiv('ne-phone-danger-zone')
    const remove = zone.createEl('button', {
      cls: 'ne-phone-row ne-phone-delete-row',
      text: t('ui.delete'),
    })
    remove.dataset['action'] = 'delete'
    onTap(remove, () => {
      this.closeKeypad()
      this.confirmDelete()
    })
  }

  private addPickerRow(
    parent: HTMLElement,
    label: string,
    shownValue: string,
    buildControl: (shown: HTMLElement) => HTMLElement,
    onRowTap?: () => void,
  ): HTMLElement {
    const row = parent.createDiv('ne-phone-row')
    row.createSpan({ cls: 'ne-phone-row-label', text: label })
    const shown = row.createSpan({ cls: 'ne-phone-row-value', text: shownValue })
    row.appendChild(buildControl(shown))
    if (onRowTap) {
      row.addEventListener('click', () => {
        this.closeKeypad()
        onRowTap()
      })
    }
    return row
  }

  private addChoiceRow(
    parent: HTMLElement,
    label: string,
    shownValue: string,
    choices: SheetChoice[],
    currentKey: () => string,
    onPick: (key: string) => void,
    required = false,
  ) {
    const row = parent.createDiv('ne-phone-row ne-phone-choice-row')
    row.setAttribute('role', 'button')
    row.tabIndex = 0
    const caption = row.createSpan({ cls: 'ne-phone-row-label', text: label })
    if (required) caption.createSpan({ text: '*', cls: 'ne-field-required', attr: { 'aria-hidden': 'true' } })
    const shown = row.createSpan({ cls: 'ne-phone-row-value', text: shownValue })

    const openSheet = () => {
      this.closeKeypad()
      openChoiceSheet({
        containerEl: this.contentEl,
        title: label,
        choices,
        selected: currentKey(),
        searchable: true,
        onSelect: (key) => {
          onPick(key)
          shown.textContent = choices.find(choice => choice.key === key)?.label ?? (key || BLANK)
        },
      })
    }

    row.addEventListener('click', openSheet)
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      openSheet()
    })
  }

  private withBlankChoice(choices: SheetChoice[]): SheetChoice[] {
    return [{ key: '', label: BLANK }, ...choices]
  }

  private openKeypad() {
    this.clearProblem()
    if (this.keypad) return
    this.keypadState = { ...this.keypadState, amountValue: this.draft.amount }
    this.contentEl.addClass('ne-keypad-active')
    const { sheet, titleEl, close } = openSheetFrame({
      containerEl: this.contentEl,
      title: '',
      leading: null,
      trailing: null,
      onClose: () => {
        this.keypad = null
        this.dismissKeypad = null
        this.keypadTitle = null
        this.contentEl.removeClass('ne-keypad-active')
      },
    })
    sheet.addClass('ne-keypad-sheet')
    this.keypadTitle = titleEl
    this.dismissKeypad = close
    this.keypad = new AmountKeypad({
      parentEl: sheet,
      initialState: this.keypadState,
      onKey: (key) => this.onKeypadKey(key),
    })
    this.refreshHeroAmount()
    this.refreshKeypadTitle()
  }

  private closeKeypad() {
    if (this.dismissKeypad) {
      this.dismissKeypad()
      return
    }
    this.keypad?.remove()
    this.keypad = null
    this.keypadTitle = null
    this.contentEl.removeClass('ne-keypad-active')
  }

  private onKeypadKey(key: KeypadKey) {
    this.clearProblem()
    this.keypadState = pressKeypadKey(this.keypadState, key)
    this.patch({ amount: this.keypadState.amountValue })
    this.keypad?.update(this.keypadState)
    this.refreshHeroAmount()
    this.refreshKeypadTitle()
    if (key === 'done' && !this.keypadState.errorKey && !this.keypadState.isPendingExpression) {
      this.closeKeypad()
    }
  }

  private refreshHeroAmount() {
    if (!this.heroAmount) return
    this.heroAmount.textContent = heroAmountLabel(this.draft.amount, this.draft.isRefund)
    this.heroAmount.toggleClass('is-empty', this.draft.amount === '')
    this.refreshTotalPaid()
  }

  private refreshKeypadTitle() {
    if (!this.keypadTitle) return
    const { expressionText, isPendingExpression } = this.keypadState
    this.keypadTitle.textContent = expressionText
    this.keypadTitle.toggleClass('is-empty', expressionText === '')
    this.keypadTitle.toggleClass('is-warning', isPendingExpression)
  }

  private formatDate(): string {
    return this.draft.date.replace(/-/g, '/')
  }

  protected async submit() {
    if (this.keypadState.submitBlocker) {
      this.showProblem(t(this.keypadState.submitBlocker))
      return
    }
    await super.submit()
  }

  onClose() {
    this.dismissKeypad?.()
    this.keypad?.remove()
    this.keypad = null
    this.dismissKeypad = null
    this.viewportListeners.forEach(remove => remove())
    this.viewportListeners = []
    document.body.removeClass('ne-sheet-lock')
    this.containerEl.removeClass('ne-entry-form-container')
    this.contentEl.removeClass('ne-sheet-active')
    this.contentEl.removeClass('ne-phone-text-focus')
    this.contentEl.removeClass('ne-keypad-active')
    super.onClose()
  }
}
