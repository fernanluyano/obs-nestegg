import { Notice } from 'obsidian'
import { nextAccountColor } from '../../domain/colors'
import { todayString } from '../../domain/dates'
import { nameProblem } from '../../domain/names'
import type { AccountType } from '../../domain/types'
import { t, tn } from '../../labels'
import { renderColorSwatches } from '../../modal/ColorSwatches'
import { checkBalance } from '../model'
import { runAction, type WizardContext } from '../WizardContext'

const ACCOUNT_TYPES: AccountType[] = ['cash', 'creditCard']

export function renderAddAccountForm(container: HTMLElement, ctx: WizardContext): void {
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

  const balanceInput = field(t('settings.enteredBalance')).createEl('input', { type: 'number', placeholder: '0.00', cls: 'ne-add-wallet-input' })
  balanceInput.addEventListener('input', () => { balance = balanceInput.value })

  const dateInput = field(t('settings.enteredBalanceAsOf')).createEl('input', { type: 'date', cls: 'ne-add-wallet-input' })
  dateInput.value = asOf
  dateInput.addEventListener('change', () => { asOf = dateInput.value })

  let color = nextAccountColor(ctx.ledger.snapshot.accounts.map(a => a.account.color))
  renderColorSwatches(field(t('settings.accountColor')), color, (picked) => { color = picked })

  const hint = card.createDiv('ne-balance-hint')
  const updateHint = () => hint.setText(type === 'creditCard' ? t('settings.creditBalanceHint') : t('settings.cashBalanceHint'))
  typeSelect.addEventListener('change', () => { type = typeSelect.value as AccountType; updateHint() })
  updateHint()

  const submit = async () => {
    if (!name) { new Notice(t('err.accountNameEmpty')); return }
    if (nameProblem(name)) { new Notice(t('err.invalidName')); return }
    const checked = checkBalance(balance)
    if (!checked.ok) { new Notice(t(checked.message)); return }
    await runAction(
      ctx,
      () => ctx.ledger.addAccount({ name, accountType: type, enteredBalanceCents: checked.cents, enteredBalanceAsOf: asOf, color }),
      tn('notice.accountAdded', { name }),
    )
  }
  card.createDiv('ne-add-wallet-submit').createEl('button', { text: t('settings.addAccount'), cls: 'mod-cta' })
    .addEventListener('click', () => { void submit() })
  for (const el of [nameInput, typeSelect, balanceInput]) {
    el.addEventListener('keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); void submit() }
    })
  }
}
