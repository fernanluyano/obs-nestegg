import { App, Notice } from 'obsidian'
import { checkBalance, parsePlanFields } from '../../domain/accounts'
import { nextAccountColor } from '../../domain/colors'
import { todayString } from '../../domain/dates'
import { formatCents } from '../../domain/money'
import { nameProblem } from '../../domain/names'
import { isLiability, LOAN_KINDS, type AccountType, type LoanKind } from '../../domain/types'
import { t, tn, type LabelKey } from '../../labels'
import { renderColorSwatches } from '../../modal/ColorSwatches'
import { ConfirmDialog } from '../../modal/ConfirmDialog'
import type { Ledger } from '../../services/Ledger'

const ACCOUNT_TYPES: AccountType[] = ['cash', 'creditCard', 'loan', 'investing']

const PLAN_ERRORS: Record<'term' | 'start' | 'interest' | 'original', LabelKey> = {
  term: 'err.loanTermInvalid',
  start: 'err.invalidDate',
  interest: 'err.loanInterestInvalid',
  original: 'err.loanOriginalInvalid',
}

export interface AddAccountFormOptions {
  app: App
  ledger: Ledger
  // Runs the ledger change and owns refreshing and error reporting.
  run: (action: () => Promise<void>, notice?: string) => Promise<void>
}

export function renderAddAccountForm(container: HTMLElement, { app, ledger, run }: AddAccountFormOptions): void {
  const card = container.createDiv('ne-card ne-add-wallet-card')
  const form = card.createDiv('ne-add-wallet-form')
  const field = (label: string) => {
    const f = form.createDiv('ne-add-wallet-field')
    f.createEl('label', { text: label, cls: 'ne-setting-input-subtitle' })
    return f
  }

  let name = ''
  let type: AccountType = 'cash'
  let balance = ''
  let asOf = todayString()

  const nameInput = field(t('settings.accountName')).createEl('input', { type: 'text', placeholder: t('settings.accountName'), cls: 'ne-add-wallet-input' })
  nameInput.addEventListener('input', () => { name = nameInput.value.trim() })

  const typeSelect = field(t('settings.accountType')).createEl('select', { cls: 'ne-add-wallet-input' })
  for (const at of ACCOUNT_TYPES) typeSelect.createEl('option', { value: at, text: t(`label.accountType.${at}`) })

  let loanKind: LoanKind = 'mortgage'
  let termMonths = ''
  let startDate = ''
  let interest = ''
  let originalAmount = ''
  const loanFields = form.createDiv('ne-add-wallet-loan')
  const loanField = (label: string) => {
    const f = loanFields.createDiv('ne-add-wallet-field')
    f.createEl('label', { text: label, cls: 'ne-setting-input-subtitle' })
    return f
  }
  const kindSelect = loanField(t('settings.loanKind')).createEl('select', { cls: 'ne-add-wallet-input' })
  for (const kind of LOAN_KINDS) kindSelect.createEl('option', { value: kind, text: t(`label.loanKind.${kind}`) })
  kindSelect.value = loanKind
  kindSelect.addEventListener('change', () => { loanKind = kindSelect.value as LoanKind })
  const termInput = loanField(t('settings.loanTerm')).createEl('input', { type: 'number', placeholder: '360', cls: 'ne-add-wallet-input' })
  termInput.addEventListener('input', () => { termMonths = termInput.value })
  const startInput = loanField(t('settings.loanStart')).createEl('input', { type: 'date', cls: 'ne-add-wallet-input' })
  startInput.addEventListener('change', () => { startDate = startInput.value })
  const interestInput = loanField(t('settings.loanInterest')).createEl('input', { type: 'number', placeholder: '6.25', cls: 'ne-add-wallet-input' })
  interestInput.setAttribute('step', '0.001')
  interestInput.addEventListener('input', () => { interest = interestInput.value })
  const originalInput = loanField(t('settings.loanOriginal')).createEl('input', { type: 'number', placeholder: '25000.00', cls: 'ne-add-wallet-input' })
  originalInput.setAttribute('step', '0.01')
  originalInput.addEventListener('input', () => { originalAmount = originalInput.value })

  const balanceInput = field(t('settings.enteredBalance')).createEl('input', { type: 'number', placeholder: '0.00', cls: 'ne-add-wallet-input' })
  balanceInput.addEventListener('input', () => { balance = balanceInput.value })

  const dateInput = field(t('settings.enteredBalanceAsOf')).createEl('input', { type: 'date', cls: 'ne-add-wallet-input' })
  dateInput.value = asOf
  dateInput.addEventListener('change', () => { asOf = dateInput.value })

  let color = nextAccountColor(ledger.snapshot.accounts.map(a => a.account.color))
  renderColorSwatches(field(t('settings.accountColor')), color, (picked) => { color = picked })

  const warning = card.createDiv({ text: t('settings.debtNegativeWarning'), cls: 'ne-debt-warning' })
  const hint = card.createDiv({ text: t('settings.cashBalanceHint'), cls: 'ne-balance-hint' })
  const updateHint = () => {
    hint.setText(t(type === 'investing' ? 'investing.noValueHint' : 'settings.cashBalanceHint'))
    warning.toggle(isLiability(type))
    loanFields.toggle(type === 'loan')
  }
  typeSelect.addEventListener('change', () => { type = typeSelect.value as AccountType; updateHint() })
  updateHint()

  // Nothing is written until the summary of what will be created has been confirmed.
  const submit = () => {
    if (!name) { new Notice(t('err.accountNameEmpty')); return }
    if (nameProblem(name)) { new Notice(t('err.invalidName')); return }
    const checked = checkBalance(balance, type)
    if (!checked.ok) { new Notice(t(checked.message)); return }
    const plan = type === 'loan' ? parsePlanFields({ termMonths, startDate, interest, originalAmount }) : null
    if (plan && !plan.ok) { new Notice(t(PLAN_ERRORS[plan.error])); return }
    const message = tn('accounts.confirmAdd', {
      type: t(`label.accountType.${type}`).toLowerCase(), name, balance: formatCents(checked.cents), date: asOf,
    })
    new ConfirmDialog(app, message, () => run(
      () => ledger.addAccount({
        name, accountType: type, enteredBalanceCents: checked.cents, enteredBalanceAsOf: asOf, color,
        ...(plan?.ok ? { loanKind, ...plan.fields } : {}),
      }),
      tn('notice.accountAdded', { name }),
    )).open()
  }
  card.createDiv('ne-add-wallet-submit').createEl('button', { text: t('settings.addAccount'), cls: 'mod-cta' })
    .addEventListener('click', submit)
  for (const el of [nameInput, typeSelect, balanceInput]) {
    el.addEventListener('keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); submit() }
    })
  }
}
