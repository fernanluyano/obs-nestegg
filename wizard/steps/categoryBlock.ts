import { migrationTargets } from '../../domain/categories'
import { miscName } from '../../domain/names'
import type { Category, TransactionType } from '../../domain/types'
import { t, tn, type LabelKey } from '../../labels'
import { ConfirmModal } from '../../modal/ConfirmModal'
import { SubcategoryPickModal } from '../../modal/SubcategoryPickModal'
import { TextPromptModal } from '../../modal/TextPromptModal'
import { categoryTypeChangeProblem, subcategoryUsage } from '../../snapshot/queries'
import { categoryRenameImpact, migrationImpact, subcategoryRenameImpact, type RenameImpact } from '../model'
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
  const { ledger } = ctx
  const block = container.createDiv('ne-category-block')
  const head = block.createDiv('ne-category-head')
  head.createEl('strong', { text: category.name })
  renderTypeSelect(head, ctx, category)

  head.createEl('button', { text: t('ui.rename') }).addEventListener('click', () => {
    promptRename(ctx, 'prompt.renameCategory', 'wizard.confirm.renameCategory', category.name,
      () => categoryRenameImpact(ledger.snapshot, category.name),
      (to) => ledger.categories.renameCategory(category.name, to))
  })

  head.createEl('button', { text: t('ui.delete'), cls: 'mod-warning' }).addEventListener('click', () => {
    confirmDelete(ctx, category, category.subcategories, 'confirm.deleteCategory',
      tn('migrate.titleCategory', { name: category.name }),
      (migrateTo) => ledger.categories.removeCategory(category.name, migrateTo))
  })

  if (category.subcategories.length === 0) {
    block.createEl('p', { text: tn('wizard.emptyCategory', { name: category.name }), cls: 'ne-wizard-error' })
  }
  const tags = block.createDiv('ne-category-tags')
  for (const sub of category.subcategories) renderSubcategory(tags, ctx, category, sub)
  renderAddRow(block, t('settings.subcategoryPlaceholder'), t('settings.addSubcategory'), (name) => {
    void runAction(ctx, () => ledger.categories.addSubcategory(category.name, name))
  })
}

const CATEGORY_TYPES: TransactionType[] = ['expense', 'income', 'transfer']

// Changes the category's type after a confirmation. It stays locked while transactions use the
// category; a declined change puts the selector back as it was.
function renderTypeSelect(head: HTMLElement, ctx: WizardContext, category: Category): void {
  const { ledger, app } = ctx
  const select = head.createEl('select', { cls: 'dropdown ne-category-type' })
  for (const type of CATEGORY_TYPES) select.createEl('option', { value: type, text: t(`label.type.${type}`) })
  select.value = category.categoryType

  const problem = categoryTypeChangeProblem(ledger.snapshot, category.name)
  if (problem) {
    select.disabled = true
    select.title = t(problem === 'used' ? 'wizard.typeLocked.used' : 'wizard.typeLocked.cardPayment')
    return
  }
  select.addEventListener('change', () => {
    const to = select.value as TransactionType
    const message = tn('wizard.confirm.changeType', {
      name: category.name, from: t(`label.type.${category.categoryType}`).toLowerCase(), to: t(`label.type.${to}`).toLowerCase(),
    })
    new ConfirmModal(
      app,
      message,
      () => runAction(ctx, () => ledger.categories.setCategoryType(category.name, to), t('notice.typeChanged')),
      () => { select.value = category.categoryType },
    ).open()
  })
}

function renderSubcategory(tags: HTMLElement, ctx: WizardContext, category: Category, sub: string): void {
  const { ledger } = ctx
  const chip = tags.createDiv('ne-category-tag')
  chip.createEl('span', { text: sub })
  if (sub === miscName(category.name)) return // Misc follows its category: renamed and removed with it

  iconButton(chip, '✎', () => {
    promptRename(ctx, 'prompt.renameSubcategory', 'wizard.confirm.renameSubcategory', sub,
      () => subcategoryRenameImpact(ledger.snapshot, sub),
      (to) => ledger.categories.renameSubcategory(sub, to))
  })
  iconButton(chip, '×', () => {
    confirmDelete(ctx, category, [sub], 'confirm.deleteSubcategory',
      tn('migrate.titleSubcategory', { name: sub }),
      (migrateTo) => ledger.categories.removeSubcategory(sub, migrateTo))
  })
}

// Unused subcategories are deleted after a plain confirm. Used ones first ask where their
// transactions should point; the removal then moves them and deletes in one go.
function confirmDelete(
  ctx: WizardContext,
  category: Category,
  removed: string[],
  confirmKey: LabelKey,
  title: string,
  run: (migrateTo?: string) => Promise<void>,
): void {
  const { ledger, app } = ctx
  if (removed.every(s => subcategoryUsage(ledger.snapshot, s) === 0)) {
    new ConfirmModal(app, t(confirmKey), () => runAction(ctx, () => run())).open()
    return
  }
  const categories = ledger.snapshot.categories.map(c => c.category)
  const impact = migrationImpact(ledger.snapshot, removed)
  new SubcategoryPickModal(app, {
    title,
    intro: tn('migrate.intro', { transactions: String(impact.transactions), files: String(impact.files) }),
    label: t('migrate.target'),
    confirmText: t('migrate.confirm'),
    emptyText: tn('migrate.none', { type: t(`label.type.${category.categoryType}`).toLowerCase() }),
    targets: migrationTargets(categories, category.categoryType, removed),
    onConfirm: (target) => runAction(ctx, () => run(target), t('notice.migrated')),
  }).open()
}

export function renderAddRow(
  parent: HTMLElement,
  placeholder: string,
  buttonText: string,
  onAdd: (value: string) => void,
  leading?: (row: HTMLElement) => void,
): void {
  const row = parent.createDiv('ne-category-add-row')
  leading?.(row)
  const input = row.createEl('input', { type: 'text', placeholder, cls: 'ne-category-input' })
  const btn = row.createEl('button', { text: buttonText, cls: 'mod-cta' })
  const submit = () => { if (input.value.trim()) onAdd(input.value.trim()) }
  btn.addEventListener('click', submit)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit() })
}
