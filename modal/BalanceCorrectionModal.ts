import { App, Modal, Notice } from 'obsidian'
import { balanceAt } from '../domain/accounts'
import { todayString } from '../domain/dates'
import { centsToDecimal, formatCents } from '../domain/money'
import { isLiability, type Account, type Transaction } from '../domain/types'
import { t, tn } from '../labels'
import {
  correctionPatch, parseCorrectionForm, previewCorrection, type BalanceCorrection, type CorrectionForm,
} from './balanceCorrectionState'
import { ConfirmModal } from './ConfirmModal'

export class BalanceCorrectionModal extends Modal {
  private form: CorrectionForm
  private today = todayString()
  private previewEl!: HTMLElement

  constructor(
    app: App,
    private account: Account,
    private transactions: Transaction[],
    private onSave: (correction: BalanceCorrection) => Promise<void>,
  ) {
    super(app)
    // Today's balance as the account currently reads it, so saving untouched is a no-op.
    this.form = {
      balance: centsToDecimal(balanceAt(account, transactions, this.today)),
      asOf: this.today,
      knownToday: '',
    }
  }

  onOpen() {
    const { contentEl, containerEl } = this
    containerEl.addClass('ne-wallet-edit-modal-container')
    contentEl.addClass('ne-modal')
    contentEl.createEl('h2', { text: tn('correction.title', { name: this.account.name }) })

    const form = contentEl.createDiv('ne-wallet-edit-form')
    if (isLiability(this.account.accountType)) form.createDiv({ text: t('settings.debtNegativeWarning'), cls: 'ne-debt-warning' })
    this.field(form, t('settings.enteredBalance'), 'number', this.form.balance, (v) => { this.form.balance = v }, '0.01')
    this.field(form, t('settings.enteredBalanceAsOf'), 'date', this.form.asOf, (v) => { this.form.asOf = v })
    form.createEl('p', {
      text: t('settings.cashBalanceHint'),
      cls: 'ne-balance-hint ne-wallet-edit-hint',
    })
    this.field(form, t('correction.knownToday'), 'number', this.form.knownToday, (v) => { this.form.knownToday = v }, '0.01')
    form.createEl('p', { text: t('correction.knownHint'), cls: 'ne-balance-hint ne-wallet-edit-hint' })

    this.previewEl = contentEl.createDiv('ne-correction-preview')
    this.renderPreview()

    const row = contentEl.createDiv('ne-btn-row')
    const save = row.createEl('button', { text: t('ui.save'), cls: 'mod-cta' })
    save.dataset['action'] = 'save'
    save.addEventListener('click', () => this.submit())
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
    input.addEventListener('input', () => { onInput(input.value); this.renderPreview() })
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur() })
  }

  private renderPreview() {
    this.previewEl.empty()
    const parsed = parseCorrectionForm(this.form, this.account.accountType)
    if (!parsed.ok) return
    const { asOf } = parsed.value
    const p = previewCorrection(this.account, this.transactions, parsed.value, this.today)
    const line = (text: string, cls = '') => this.previewEl.createEl('p', { text, cls: `ne-balance-hint ${cls}`.trim() })

    line(tn('correction.preview.current', { projected: formatCents(p.projectedCents), previous: formatCents(p.previousCents) }))
    if (p.rowsAfter > 0) {
      line(tn('correction.preview.after', { count: String(p.rowsAfter), date: asOf, net: formatCents(p.netAfterCents) }))
    }
    if (p.rowsCovered > 0) {
      line(tn('correction.preview.covered', { count: String(p.rowsCovered), date: asOf }))
    }
    if (p.warnPastDate) line(t('correction.warn.pastDate'), 'ne-correction-warn')
    if (p.check?.status === 'match') line(t('correction.check.match'), 'ne-correction-ok')
    if (p.check?.status === 'mismatch') {
      line(tn('correction.check.mismatch', { diff: formatCents(Math.abs(p.check.diffCents)) }), 'ne-correction-warn')
    }
  }

  private submit() {
    const parsed = parseCorrectionForm(this.form, this.account.accountType)
    if (!parsed.ok) { new Notice(t(parsed.reason)); return }
    const { value } = parsed
    const p = previewCorrection(this.account, this.transactions, value, this.today)
    const patch = correctionPatch(value, p)
    const message = tn('correction.confirm', {
      name: this.account.name, previous: formatCents(p.previousCents), projected: formatCents(p.projectedCents),
    }) + (patch.unbalancedCents === undefined ? '' : ' ' + t('correction.confirmUnbalanced'))
    new ConfirmModal(this.app, message, async () => {
      try {
        await this.onSave(patch)
        this.close()
      } catch (e) {
        new Notice(e instanceof Error ? e.message : String(e))
      }
    }).open()
  }

  onClose() {
    this.containerEl.removeClass('ne-wallet-edit-modal-container')
    this.contentEl.empty()
  }
}
