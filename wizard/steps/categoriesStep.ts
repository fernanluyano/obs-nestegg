import type { TransactionType } from '../../domain/types'
import { t, tn } from '../../labels'
import { runAction, type WizardContext } from '../WizardContext'
import { renderAddRow, renderCategoryBlock } from './categoryBlock'

const SECTIONS: { type: TransactionType; title: () => string }[] = [
  { type: 'expense', title: () => t('settings.expenseCategories') },
  { type: 'income', title: () => t('settings.incomeCategories') },
  { type: 'transfer', title: () => t('settings.transferCategories') },
]

export function renderCategories(container: HTMLElement, ctx: WizardContext): void {
  container.createEl('p', { text: t('wizard.categories.intro') })
  container.createEl('p', { text: t('wizard.categories.rewriteWarning'), cls: 'ne-wizard-callout' })

  const card = container.createDiv('ne-card ne-category-card')
  const all = ctx.ledger.snapshot.categories.map(c => c.category)
  SECTIONS.forEach(({ type, title }, i) => {
    if (i > 0) card.createEl('hr', { cls: 'ne-category-divider' })
    card.createEl('div', { text: title(), cls: 'ne-setting-input-subtitle' })
    for (const category of all.filter(c => c.categoryType === type)) renderCategoryBlock(card, ctx, category)
    renderAddRow(card, t('settings.categoryPlaceholder'), t('settings.addCategory'), (name) => {
      void runAction(ctx, () => ctx.ledger.categories.createCategory(name, type), tn('notice.categoryAdded', { name }))
    })
  })
}
