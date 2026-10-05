import { miscName } from '../../domain/names'
import type { Category } from '../../domain/types'
import { t, tn, type LabelKey } from '../../labels'
import { ConfirmModal } from '../../modal/ConfirmModal'
import { TextPromptModal } from '../../modal/TextPromptModal'
import { subcategoryUsage } from '../../snapshot/queries'
import { categoryRenameImpact, subcategoryRenameImpact, type RenameImpact } from '../model'
import { runAction, type WizardContext } from '../WizardContext'

function iconButton(parent: HTMLElement, text: string, onClick: () => void): void {
  parent.createEl('button', { text, cls: 'ne-tag-remove' }).addEventListener('click', onClick)
}

// Asks for the new name, then explains what the rename rewrites before doing it.
function promptRename(
  ctx: WizardContext,
  promptKey: LabelKey,
  confirmKey: LabelKey,
  from: string,
  impactOf: () => RenameImpact,
  run: (to: string) => Promise<void>,
): void {
  new TextPromptModal(ctx.app, t(promptKey), from, async (to) => {
    const impact = impactOf()
    const message = tn(confirmKey, { from, to, files: String(impact.files), transactions: String(impact.transactions) })
    new ConfirmModal(ctx.app, message, () => runAction(ctx, () => run(to), t('notice.renamed'))).open()
  }).open()
}

export function renderCategoryBlock(container: HTMLElement, ctx: WizardContext, category: Category): void {
  const { ledger, app } = ctx
  const block = container.createDiv('ne-category-block')
  const head = block.createDiv('ne-category-head')
  head.createEl('strong', { text: category.name })

  head.createEl('button', { text: t('ui.rename') }).addEventListener('click', () => {
    promptRename(ctx, 'prompt.renameCategory', 'wizard.confirm.renameCategory', category.name,
      () => categoryRenameImpact(ledger.snapshot, category.name),
      (to) => ledger.categories.renameCategory(category.name, to))
  })

  const unused = category.subcategories.every(s => subcategoryUsage(ledger.snapshot, s) === 0)
  if (unused) {
    head.createEl('button', { text: t('ui.delete'), cls: 'mod-warning' }).addEventListener('click', () => {
      new ConfirmModal(app, t('confirm.deleteCategory'), () => runAction(ctx, () => ledger.categories.removeCategory(category.name))).open()
    })
  }

  if (category.subcategories.length === 0) {
    block.createEl('p', { text: tn('wizard.emptyCategory', { name: category.name }), cls: 'ne-wizard-error' })
  }
  const tags = block.createDiv('ne-category-tags')
  for (const sub of category.subcategories) renderSubcategory(tags, ctx, category, sub)
  renderAddRow(block, t('settings.subcategoryPlaceholder'), t('settings.addSubcategory'), (name) => {
    void runAction(ctx, () => ledger.categories.addSubcategory(category.name, name))
  })
}

function renderSubcategory(tags: HTMLElement, ctx: WizardContext, category: Category, sub: string): void {
  const { ledger, app } = ctx
  const chip = tags.createDiv('ne-category-tag')
  chip.createEl('span', { text: sub })
  if (sub === miscName(category.name)) return // Misc follows its category: renamed and removed with it

  iconButton(chip, '✎', () => {
    promptRename(ctx, 'prompt.renameSubcategory', 'wizard.confirm.renameSubcategory', sub,
      () => subcategoryRenameImpact(ledger.snapshot, sub),
      (to) => ledger.categories.renameSubcategory(sub, to))
  })
  if (subcategoryUsage(ledger.snapshot, sub) === 0) {
    iconButton(chip, '×', () => {
      new ConfirmModal(app, t('confirm.deleteSubcategory'), () => runAction(ctx, () => ledger.categories.removeSubcategory(sub))).open()
    })
  }
}

export function renderAddRow(parent: HTMLElement, placeholder: string, buttonText: string, onAdd: (value: string) => void): void {
  const row = parent.createDiv('ne-category-add-row')
  const input = row.createEl('input', { type: 'text', placeholder, cls: 'ne-category-input' })
  const btn = row.createEl('button', { text: buttonText, cls: 'mod-cta' })
  const submit = () => { if (input.value.trim()) onAdd(input.value.trim()) }
  btn.addEventListener('click', submit)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit() })
}
