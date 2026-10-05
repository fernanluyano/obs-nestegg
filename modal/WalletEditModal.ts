import { centsToDecimal, parseCents } from '../money'
import { App, Modal, Notice } from 'obsidian'
import { Wallet } from '../types'
import { t } from '../labels'

export class WalletEditModal extends Modal {
  private wallet: Wallet
  private onSave: (patch: Partial<Wallet>) => void | Promise<void>
  private name: string
  private balance: number

  constructor(app: App, wallet: Wallet, onSave: (patch: Partial<Wallet>) => void | Promise<void>) {
    super(app)
    this.wallet = wallet
    this.onSave = onSave
    this.name = wallet.name
    this.balance = wallet.initialBalanceCents
  }

  onOpen() {
    const { contentEl, containerEl } = this
    containerEl.addClass('ne-wallet-edit-modal-container')
    contentEl.addClass('ne-modal')
    contentEl.createEl('h2', { text: t('ui.edit') })

    const formEl = contentEl.createDiv('ne-wallet-edit-form')
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches
    const syncKeyboardState = () => {
      if (!isTouchDevice) return
      const activeEl = document.activeElement
      const isEditingFieldFocused = !!activeEl && formEl.contains(activeEl)
      if (isEditingFieldFocused) {
        containerEl.setCssProps({ 'padding-bottom': '40vh' })
      } else {
        containerEl.style.removeProperty('padding-bottom')
      }
    }

    formEl.addEventListener('focusin', syncKeyboardState)
    formEl.addEventListener('focusout', () => window.requestAnimationFrame(syncKeyboardState))

    const nameRow = formEl.createDiv('ne-wallet-edit-field')
    nameRow.createEl('label', { text: t('settings.walletName'), cls: 'ne-wallet-edit-label' })
    const nameInput = nameRow.createEl('input', { type: 'text', cls: 'ne-field-input' })
    nameInput.value = this.name
    nameInput.setAttribute('enterkeyhint', 'done')
    nameInput.addEventListener('input', () => { this.name = nameInput.value.trim() })
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur() })

    const balanceRow = formEl.createDiv('ne-wallet-edit-field')
    balanceRow.createEl('label', { text: t('settings.initialBalance'), cls: 'ne-wallet-edit-label' })
    const balInput = balanceRow.createEl('input', { type: 'number', cls: 'ne-field-input' })
    balInput.setAttribute('step', '0.01')
    balInput.value = centsToDecimal(this.balance)
    balInput.setAttribute('min', '0')
    balInput.setAttribute('enterkeyhint', 'done')
    balInput.addEventListener('input', () => { this.balance = parseCents(balInput.value) ?? 0 })
    balInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') balInput.blur() })

    formEl.createEl('p', {
      text: this.wallet.type === 'creditCard'
        ? t('settings.creditBalanceHint')
        : t('settings.cashBankBalanceHint'),
      cls: 'ne-balance-hint ne-wallet-edit-hint',
    })

    const btnRow = contentEl.createDiv('ne-btn-row')
    const saveBtn = btnRow.createEl('button', { text: t('ui.save'), cls: 'mod-cta' })
    saveBtn.dataset['action'] = 'save'
    saveBtn.addEventListener('click', () => {
      if (!this.name) { new Notice(t('err.walletNameEmpty')); return }
      if ((this.wallet.type === 'cash' || this.wallet.type === 'bank') && this.balance < 0) {
        new Notice(t('err.cashBankNegativeBalance')); return
      }
      if (this.wallet.type === 'creditCard' && this.balance < 0) {
        new Notice(t('err.creditNegativeBalanceShort')); return
      }
      void this.onSave({ name: this.name, initialBalanceCents: this.balance })
      this.close()
    })
    const cancelBtn = btnRow.createEl('button', { text: t('ui.cancel') })
    cancelBtn.dataset['action'] = 'cancel'
    cancelBtn.addEventListener('click', () => this.close())
  }

  onClose() {
    this.containerEl.removeClass('ne-wallet-edit-modal-container')
    this.containerEl.style.removeProperty('padding-bottom')
    this.contentEl.empty()
  }
}
