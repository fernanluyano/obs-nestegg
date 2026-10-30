import { setIcon } from 'obsidian'
import type { TransactionType, LedgerEntry } from '../../domain/types'
import { t } from '../../labels'
import { accountLabels, amountFigure, detailLine, rowTitle, tagWarning } from '../txRowText'

const TYPE_ICONS: Record<TransactionType, string> = {
  expense: 'arrow-up-right',
  income: 'arrow-down-left',
  transfer: 'arrow-left-right',
  debt: 'landmark',
}

export function renderTxRow(
  container: HTMLElement,
  entry: LedgerEntry,
  type: TransactionType | undefined,
  colors: Map<string, string>,
  onClick: () => void,
  selection?: { selected: boolean },
): void {
  const row = container.createDiv('ne-tx-row')
  row.dataset['testid'] = 'tx-row'
  if (selection) {
    row.addClass('is-selecting')
    row.toggleClass('is-selected', selection.selected)
    const box = row.createEl('input', { type: 'checkbox', cls: 'ne-tx-check' })
    box.checked = selection.selected
    box.tabIndex = -1 // the row itself is the click target; the box only shows the state
  }

  // The day header carries the date, so the row leads with a round type marker instead.
  const avatar = row.createSpan({ cls: `ne-tx-avatar${type ? ` ne-type-${type}` : ''}`, attr: { title: type ? t(`label.type.${type}`) : '' } })
  setIcon(avatar, type ? TYPE_ICONS[type] : 'circle-dashed')

  const stack = row.createDiv('ne-tx-row-stack')
  stack.createDiv({ text: rowTitle(entry), cls: 'ne-tx-category' })
  const accountEl = stack.createDiv({ cls: 'ne-tx-wallet' })
  if (type) accountEl.createSpan({ text: `${t(`label.type.${type}`)} · `, cls: 'ne-tx-type-text' })
  accountLabels(entry).forEach((name, i) => {
    if (i > 0) accountEl.appendText(' → ')
    const part = accountEl.createSpan({ text: name })
    const color = colors.get(name)
    if (color) part.style.color = color
  })

  const line3 = stack.createDiv('ne-tx-row-line3')
  const display = detailLine(entry)
  if (display.kind === 'tags') {
    const tagsEl = line3.createSpan('ne-tx-tags')
    for (const tag of display.tags) {
      const chip = tagsEl.createSpan({ text: `#${tag}`, cls: 'ne-tx-tag-chip' })
      chip.dataset['testid'] = 'tx-tag-chip'
      chip.dataset['tag'] = tag
    }
  } else if (display.kind === 'note') {
    line3.createSpan({ text: display.text, cls: 'ne-tx-note' })
  } else {
    line3.createSpan({ text: '—', cls: 'ne-tx-empty' })
  }

  const warning = tagWarning(entry, type)
  if (warning) {
    row.addClass('has-tag-problem')
    setIcon(line3.createSpan({ cls: 'ne-tx-warning', attr: { title: warning, 'aria-label': warning } }), 'alert-triangle')
  }

  const amount = amountFigure(entry, type)
  row.createSpan({ text: amount.text, cls: amount.className })
  row.addEventListener('click', onClick)
}
