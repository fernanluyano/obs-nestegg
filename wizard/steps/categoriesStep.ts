import { TRANSACTION_TYPES, type TransactionType } from '../../domain/types'
import { t, tn } from '../../labels'
import { runAction, type WizardContext } from '../WizardContext'
import { renderAddRow, renderCategoryBlock } from './categoryBlock'

export function renderCategories(container: HTMLElement, ctx: WizardContext): void {
  container.createEl('p', { text: t('wizard.categories.intro') })
  container.createEl('p', { text: t('wizard.categories.rewriteWarning'), cls: 'ne-wizard-callout' })

  const card = container.createDiv('ne-card ne-category-card')
  const all = ctx.ledger.snapshot.categories.map(c => c.category)
  all.forEach((category, i) => {
    if (i > 0) card.createEl('hr', { cls: 'ne-category-divider' })
    renderCategoryBlock(card, ctx, category)
  })

  if (all.length > 0) card.createEl('hr', { cls: 'ne-category-divider' })
  let miscType: TransactionType = 'expense'
  renderAddRow(card, t('settings.categoryPlaceholder'), t('settings.addCategory'), (name) => {
    void runAction(ctx, () => ctx.ledger.categories.createCategory(name, miscType), tn('notice.categoryAdded', { name }))
  }, (row) => {
    const select = row.createEl('select', { cls: 'dropdown' })
    for (const type of TRANSACTION_TYPES) select.createEl('option', { value: type, text: t(`label.type.${type}`) })
    select.addEventListener('change', () => { miscType = select.value as TransactionType })
  })
}
