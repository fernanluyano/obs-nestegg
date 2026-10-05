import type { TransactionType, LedgerEntry } from '../../domain/types'
import { dateToMonthDay } from '../../utils'
import { t } from '../../labels'
import { buildAccountText, buildAmountDisplay, buildLine3Display, buildTitleText } from '../detailRow'

export function renderTxRow(
  container: HTMLElement,
  entry: LedgerEntry,
  type: TransactionType | undefined,
  onClick: () => void,
): void {
  const row = container.createDiv('ne-tx-row')
  row.dataset['testid'] = 'tx-row'

  row.createEl('span', { text: dateToMonthDay(entry.date), cls: 'ne-tx-date' })
  if (type) row.createEl('span', { text: t(`label.type.${type}`), cls: `ne-type-badge ne-type-${type}` })
  else row.createEl('span', { text: '—', cls: 'ne-type-badge' })

  const stack = row.createDiv('ne-tx-row-stack')
  stack.createEl('div', { text: buildTitleText(entry), cls: 'ne-tx-category' })
  stack.createEl('div', { text: buildAccountText(entry), cls: 'ne-tx-wallet' })

  const line3 = stack.createDiv('ne-tx-row-line3')
  const display = buildLine3Display(entry)
  if (display.kind === 'tags') {
    const tagsEl = line3.createSpan('ne-tx-tags')
    for (const tag of display.tags) {
      const chip = tagsEl.createSpan({ text: `#${tag}`, cls: 'ne-tx-tag-chip' })
      chip.dataset['testid'] = 'tx-tag-chip'
      chip.dataset['tag'] = tag
    }
  } else if (display.kind === 'note') {
    line3.createEl('span', { text: display.text, cls: 'ne-tx-note' })
  } else {
    line3.createEl('span', { text: '—', cls: 'ne-tx-empty' })
  }

  const amount = buildAmountDisplay(entry, type)
  row.createEl('span', { text: amount.text, cls: amount.className })
  row.addEventListener('click', onClick)
}
