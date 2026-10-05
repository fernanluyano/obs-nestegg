import { setIcon } from 'obsidian'
import type { TransactionType } from '../domain/types'
import { t } from '../labels'
import { knownMerchants, suggestedTags } from '../snapshot/queries'
import { TransactionModal } from './TransactionModal'
import { formatMobileHeroAmount } from '../utils'
import { accountChoices, activeAccounts, categoryChoices, transferAccountCandidates } from './transactionState'
import { openBottomSheetPicker, openBottomSheetShell, type BottomSheetOption } from './BottomSheetPicker'
import { openTagPicker } from './TagPicker'
import { MobileCalculatorPad } from './MobileCalculatorPad'
import {
  createMobileCalculatorState,
  pressMobileCalculatorKey,
  type MobileCalculatorKey,
  type MobileCalculatorState,
} from './mobileCalculatorState'

export class MobileTransactionModal extends TransactionModal {
  private mobileTabsEl!: HTMLElement
  private mobileRowsEl!: HTMLElement
  private mobileAmountEl!: HTMLElement
  private mobileCalculatorState: MobileCalculatorState = createMobileCalculatorState()
  private mobileCalculatorPad: MobileCalculatorPad | null = null
  private mobileCalculatorClose: (() => void) | null = null
  private mobileCalculatorTitleEl: HTMLElement | null = null
  private viewportCleanups: (() => void)[] = []

  onOpen() {
    this.buildMobileUI()
    // iOS auto-focuses first button; delay ensures blur after animation
    setTimeout(() => (document.activeElement as HTMLElement)?.blur(), 100)
  }

  private buildMobileUI() {
    const { contentEl, containerEl } = this
    contentEl.empty()
    contentEl.addClass('ne-mobile-content')
    containerEl.addClass('ne-transaction-modal-container')

    // Top bar: x | title | check
    const topBar = contentEl.createDiv('ne-mobile-top-bar')
    const cancelBtn = topBar.createEl('button', { cls: 'ne-mobile-top-btn', text: '✕' })
    const titleEl = topBar.createEl('span', {
      cls: 'ne-mobile-top-title',
      text: this.editing ? t('modal.editTitle') : t('modal.addTitle'),
    })
    if (this.editing) {
      const iconEl = titleEl.createSpan('ne-modal-title-icon')
      setIcon(iconEl, 'pencil')
    }
    const confirmBtn = topBar.createEl('button', {
      cls: 'ne-mobile-top-btn ne-mobile-top-confirm',
      text: '✓',
    })
    let cancelTouched = false
    cancelBtn.addEventListener('touchend', (e) => { e.preventDefault(); cancelTouched = true; this.close() })
    cancelBtn.addEventListener('click', () => { if (cancelTouched) { cancelTouched = false; return } this.close() })
    let confirmTouched = false
    confirmBtn.addEventListener('touchend', (e) => { e.preventDefault(); confirmTouched = true; void this.handleConfirm() })
    confirmBtn.addEventListener('click', () => { if (confirmTouched) { confirmTouched = false; return } void this.handleConfirm() })

    // Type tabs
    this.mobileTabsEl = contentEl.createDiv('ne-mobile-tabs')
    this.renderMobileTabs()

    // Amount display
    const amountArea = contentEl.createDiv('ne-mobile-amount-area')
    amountArea.setAttribute('role', 'button')
    amountArea.tabIndex = 0
    amountArea.addEventListener('click', () => this.openCalculatorPad())
    amountArea.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      this.openCalculatorPad()
    })
    this.mobileAmountEl = amountArea.createDiv('ne-mobile-amount-display')
    this.mobileCalculatorState = createMobileCalculatorState(this.form.amount)
    this.updateAmountDisplay()

    // Error
    this.errorEl = contentEl.createDiv('ne-error ne-mobile-error')
    this.errorEl.hide()

    // Field rows (delete row appended inside renderMobileRows when editing)
    this.mobileRowsEl = contentEl.createDiv('ne-mobile-rows')
    this.renderMobileRows()

    this.bindMobileTextFocusState()
  }

  private bindMobileTextFocusState() {
    const isTextKeyboardTarget = (target: EventTarget | null): target is HTMLElement => {
      return target instanceof HTMLElement &&
        target.matches('.ne-mobile-note-input, .ne-bottom-sheet-search, .ne-tag-picker-add-input')
    }

    this.contentEl.addEventListener('focusin', (e) => {
      if (isTextKeyboardTarget(e.target)) {
        this.contentEl.addClass('ne-mobile-text-focus')
      }
    })

    this.contentEl.addEventListener('focusout', () => {
      window.setTimeout(() => {
        if (!isTextKeyboardTarget(document.activeElement)) {
          this.contentEl.removeClass('ne-mobile-text-focus')
        }
      }, 0)
    })

    if (window.visualViewport) {
      const el = this.contentEl
      const update = () => {
        const kbHeight = Math.max(0, window.innerHeight - window.visualViewport!.height)
        if (kbHeight > 50) {
          el.style.setProperty('--ne-keyboard-h', `${kbHeight}px`)
        } else {
          el.style.removeProperty('--ne-keyboard-h')
        }
      }
      window.visualViewport.addEventListener('resize', update)
      this.viewportCleanups.push(() => window.visualViewport?.removeEventListener('resize', update))
    }
  }

  private renderMobileTabs() {
    this.mobileTabsEl.empty()
    const types: TransactionType[] = ['expense', 'income', 'transfer']
    for (const tp of types) {
      const tab = this.mobileTabsEl.createEl('button', {
        text: t(`label.type.${tp}`),
        cls: 'ne-mobile-tab' + (this.form.type === tp ? ' is-active' : ''),
      })
      tab.addEventListener('click', () => {
        this.changeType(tp)
        this.renderMobileTabs()
        this.renderMobileRows()
      })
    }
  }

  private renderMobileRows() {
    this.mobileRowsEl.empty()
    const ctx = this.context()
    const { form } = this
    const isTransfer = form.type === 'transfer'

    // Refund toggle first (expense only) — sub-option of the type tab, visually adjacent.
    if (form.type === 'expense') {
      const block = this.mobileRowsEl.createDiv('ne-refund-block')
      const refundRow = block.createDiv('ne-mobile-row ne-mobile-refund-row')
      const checkboxId = 'ne-mobile-refund-checkbox'
      refundRow.createEl('label', { cls: 'ne-mobile-row-label', text: t('modal.isRefund'), attr: { for: checkboxId } })
      const checkbox = refundRow.createEl('input', { type: 'checkbox' })
      checkbox.id = checkboxId
      checkbox.checked = form.isRefund
      checkbox.addEventListener('change', () => {
        this.update({ isRefund: checkbox.checked })
        this.updateAmountDisplay()
      })
      block.createDiv({ cls: 'ne-mobile-refund-hint-row', text: t('modal.isRefund.hint') })
    }

    // Date Picker
    let dateInput!: HTMLInputElement
    this.addMobilePickerRow(
      this.mobileRowsEl, t('modal.date'), this.formatMobileDate(),
      (valueEl) => {
        dateInput = createEl('input', { type: 'date' })
        dateInput.value = form.date
        dateInput.addClass('ne-hidden-date-trigger')
        dateInput.addEventListener('change', () => {
          this.update({ date: dateInput.value })
          valueEl.textContent = this.formatMobileDate()
        })
        return dateInput
      },
      () => dateInput.focus(),
    ).addClass('ne-mobile-date-row')

    const choices = categoryChoices(ctx.categories, form.type)
    this.addMobileBottomSheetRow(
      this.mobileRowsEl,
      t('modal.subcategory'),
      form.subcategory || '—',
      this.withEmptyOption(choices.map(c => ({ key: c.key, label: `${c.category} › ${c.label}` }))),
      () => this.form.subcategory,
      (key) => {
        this.update({ subcategory: key })
        if (isTransfer) {
          this.normalizeAccounts()
          this.renderMobileRows()
        }
      },
      true,
    )

    if (isTransfer) {
      const { fromCandidates, toCandidates } = transferAccountCandidates(activeAccounts(ctx.accounts), form.subcategory)
      this.addMobileBottomSheetRow(
        this.mobileRowsEl, t('modal.fromAccount'), form.fromAccount || '—',
        this.withEmptyOption(fromCandidates.map(a => ({ key: a.name, label: a.name }))),
        () => this.form.fromAccount, (key) => this.update({ fromAccount: key }), true,
      )
      this.addMobileBottomSheetRow(
        this.mobileRowsEl, t('modal.toAccount'), form.toAccount || '—',
        this.withEmptyOption(toCandidates.map(a => ({ key: a.name, label: a.name }))),
        () => this.form.toAccount, (key) => this.update({ toAccount: key }), true,
      )
    } else {
      this.addMobileBottomSheetRow(
        this.mobileRowsEl, t('modal.account'), form.account || '—',
        this.withEmptyOption(accountChoices(ctx.accounts, form.type).map(a => ({ key: a.name, label: a.name }))),
        () => this.form.account, (key) => this.update({ account: key }), true,
      )
    }

    // Merchant — free text with the known merchants offered as suggestions
    const merchantRow = this.mobileRowsEl.createDiv('ne-mobile-row')
    merchantRow.createEl('span', { cls: 'ne-mobile-row-label', text: t('modal.merchant') })
    const merchantInput = merchantRow.createEl('input', {
      type: 'text', cls: 'ne-mobile-note-input', placeholder: t('modal.merchant'),
    })
    merchantInput.setAttribute('list', 'ne-mobile-merchant-list')
    merchantInput.setAttribute('enterkeyhint', 'done')
    merchantInput.value = form.merchant
    const merchantList = merchantRow.createEl('datalist', { attr: { id: 'ne-mobile-merchant-list' } })
    for (const merchant of knownMerchants(this.ledger.snapshot)) merchantList.createEl('option', { value: merchant })
    merchantInput.addEventListener('focus', () => this.closeCalculatorPad())
    merchantInput.addEventListener('input', () => this.update({ merchant: merchantInput.value }))
    merchantInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') merchantInput.blur() })

    // Tags — chips-or-placeholder row, taps anywhere to open multi-select picker
    const tagRow = this.mobileRowsEl.createDiv('ne-mobile-row')
    tagRow.dataset['testid'] = 'mobile-tag-row'
    tagRow.createEl('span', { cls: 'ne-mobile-row-label', text: t('modal.tags') })
    const tagWrapper = tagRow.createDiv('ne-tag-input-wrapper')
    const tagChipsEl = tagWrapper.createDiv('ne-mobile-tag-chips')
    tagChipsEl.dataset['testid'] = 'mobile-tag-chips'

    const renderMobChips = () => {
      tagChipsEl.empty()
      if (this.form.tags.length === 0) {
        tagChipsEl.createSpan({
          cls: 'ne-mobile-tag-row-placeholder',
          text: t('tagPicker.rowPlaceholder'),
        })
        return
      }
      for (const tag of this.form.tags) {
        const chip = tagChipsEl.createSpan({
          cls: 'ne-mobile-tag-chip',
          text: `#${tag}`,
        })
        chip.dataset['testid'] = 'mobile-tag-chip'
        chip.dataset['tag'] = tag
      }
    }

    tagRow.addEventListener('click', () => {
      this.closeCalculatorPad()
      openTagPicker({
        containerEl: this.contentEl,
        availableTags: suggestedTags(this.ledger.snapshot),
        initialSelected: this.form.tags,
        onCommit: (selected) => {
          this.update({ tags: selected })
          renderMobChips()
        },
      })
    })

    renderMobChips()

    // Note
    const noteRow = this.mobileRowsEl.createDiv('ne-mobile-row')
    noteRow.createEl('span', { cls: 'ne-mobile-row-label', text: t('modal.note') })
    const noteInput = noteRow.createEl('input', {
      type: 'text',
      cls: 'ne-mobile-note-input',
      placeholder: t('modal.note'),
    })
    noteInput.value = this.form.note
    noteInput.setAttribute('enterkeyhint', 'done')
    noteInput.addEventListener('focus', () => this.closeCalculatorPad())
    noteInput.addEventListener('input', () => this.update({ note: noteInput.value }))
    noteInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') noteInput.blur() })

    this.renderMobileDeleteRow()
  }

  private renderMobileDeleteRow() {
    if (!this.editing) return
    const deleteWrap = this.mobileRowsEl.createDiv('ne-mobile-danger-zone')
    const deleteBtn = deleteWrap.createEl('button', {
      cls: 'ne-mobile-row ne-mobile-delete-row',
      text: t('ui.delete'),
    })
    deleteBtn.dataset['action'] = 'delete'
    let deleteTouched = false
    deleteBtn.addEventListener('touchend', (e) => {
      e.preventDefault()
      deleteTouched = true
      this.closeCalculatorPad()
      this.handleDelete()
    })
    deleteBtn.addEventListener('click', () => {
      if (deleteTouched) {
        deleteTouched = false
        return
      }
      this.closeCalculatorPad()
      this.handleDelete()
    })
  }

  private addMobilePickerRow(
    container: HTMLElement,
    label: string,
    initialValue: string,
    buildPicker: (valueEl: HTMLElement) => HTMLElement,
    onRowClick?: () => void,
  ): HTMLElement {
    const row = container.createDiv('ne-mobile-row')
    row.createEl('span', { cls: 'ne-mobile-row-label', text: label })
    const valueEl = row.createEl('span', { cls: 'ne-mobile-row-value', text: initialValue })
    const picker = buildPicker(valueEl)
    row.appendChild(picker)
    if (onRowClick) {
      row.addEventListener('click', () => {
        this.closeCalculatorPad()
        onRowClick()
      })
    }
    return row
  }

  private addMobileBottomSheetRow(
    container: HTMLElement,
    label: string,
    initialValue: string,
    options: BottomSheetOption[],
    getSelected: () => string,
    onSelect: (key: string) => void,
    required = false,
  ) {
    const row = container.createDiv('ne-mobile-row ne-mobile-bottom-sheet-row')
    row.setAttribute('role', 'button')
    row.tabIndex = 0
    const labelEl = row.createEl('span', { cls: 'ne-mobile-row-label', text: label })
    if (required) labelEl.createEl('span', { text: '*', cls: 'ne-field-required', attr: { 'aria-hidden': 'true' } })
    const valueEl = row.createEl('span', { cls: 'ne-mobile-row-value', text: initialValue })

    const openPicker = () => {
      this.closeCalculatorPad()
      openBottomSheetPicker({
        containerEl: this.contentEl,
        title: label,
        options,
        selected: getSelected(),
        searchable: true,
        onSelect: (key) => {
          onSelect(key)
          const found = options.find(option => option.key === key)
          valueEl.textContent = found?.label ?? (key || '—')
        },
      })
    }

    row.addEventListener('click', openPicker)
    row.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      openPicker()
    })
  }

  private withEmptyOption(options: BottomSheetOption[]): BottomSheetOption[] {
    return [{ key: '', label: '—' }, ...options]
  }

  private openCalculatorPad() {
    this.clearError()
    if (this.mobileCalculatorPad) return
    this.mobileCalculatorState = {
      ...this.mobileCalculatorState,
      amountValue: this.form.amount,
    }
    this.contentEl.addClass('ne-mobile-calculator-active')
    const { sheet, titleEl, close } = openBottomSheetShell({
      containerEl: this.contentEl,
      title: '',
      leftBtn: null,
      rightBtn: null,
      onClose: () => {
        this.mobileCalculatorPad = null
        this.mobileCalculatorClose = null
        this.mobileCalculatorTitleEl = null
        this.contentEl.removeClass('ne-mobile-calculator-active')
      },
    })
    sheet.addClass('ne-mobile-calculator-sheet')
    this.mobileCalculatorTitleEl = titleEl
    this.mobileCalculatorClose = close
    this.mobileCalculatorPad = new MobileCalculatorPad({
      parentEl: sheet,
      initialState: this.mobileCalculatorState,
      onKey: (key) => this.handleCalculatorKey(key),
    })
    this.updateAmountDisplay()
    this.updateCalculatorTitle()
  }

  private closeCalculatorPad() {
    if (this.mobileCalculatorClose) {
      this.mobileCalculatorClose()
      return
    }
    this.mobileCalculatorPad?.remove()
    this.mobileCalculatorPad = null
    this.mobileCalculatorTitleEl = null
    this.contentEl.removeClass('ne-mobile-calculator-active')
  }

  private handleCalculatorKey(key: MobileCalculatorKey) {
    this.clearError()
    this.mobileCalculatorState = pressMobileCalculatorKey(this.mobileCalculatorState, key)
    this.update({ amount: this.mobileCalculatorState.amountValue })
    this.mobileCalculatorPad?.update(this.mobileCalculatorState)
    this.updateAmountDisplay()
    this.updateCalculatorTitle()
    if (key === 'done' && !this.mobileCalculatorState.errorKey && !this.mobileCalculatorState.isPendingExpression) {
      this.closeCalculatorPad()
    }
  }

  private updateAmountDisplay() {
    if (!this.mobileAmountEl) return
    const isEmpty = this.form.amount === ''
    this.mobileAmountEl.textContent = formatMobileHeroAmount(this.form.amount, this.form.isRefund)
    this.mobileAmountEl.toggleClass('is-empty', isEmpty)
  }

  private updateCalculatorTitle() {
    if (!this.mobileCalculatorTitleEl) return
    const expressionText = this.mobileCalculatorState.expressionText
    this.mobileCalculatorTitleEl.textContent = expressionText
    this.mobileCalculatorTitleEl.toggleClass('is-empty', expressionText === '')
    this.mobileCalculatorTitleEl.toggleClass('is-warning', this.mobileCalculatorState.isPendingExpression)
  }

  private formatMobileDate(): string {
    return this.form.date.replace(/-/g, '/')
  }

  protected async handleConfirm() {
    if (this.mobileCalculatorState.submitBlocker) {
      this.showError(t(this.mobileCalculatorState.submitBlocker))
      return
    }
    await super.handleConfirm()
  }

  onClose() {
    this.mobileCalculatorClose?.()
    this.mobileCalculatorPad?.remove()
    this.mobileCalculatorPad = null
    this.mobileCalculatorClose = null
    this.viewportCleanups.forEach(fn => fn())
    this.viewportCleanups = []
    document.body.removeClass('ne-bottom-sheet-lock')
    this.containerEl.removeClass('ne-transaction-modal-container')
    this.contentEl.removeClass('ne-bottom-sheet-active')
    this.contentEl.removeClass('ne-mobile-text-focus')
    this.contentEl.removeClass('ne-mobile-calculator-active')
    super.onClose()
  }
}
