import { buildCategoryIndex, migrationTargets } from '../../domain/categories'
import { miscName } from '../../domain/names'
import { TRANSACTION_TYPES, type Category, type Subcategory, type TransactionType } from '../../domain/types'
import { t, tn, type LabelKey } from '../../labels'
import { ConfirmModal } from '../../modal/ConfirmModal'
import { SubcategoryPickModal } from '../../modal/SubcategoryPickModal'
import { TextPromptModal } from '../../modal/TextPromptModal'
import { subcategoryTypeLocked, subcategoryUsage } from '../../snapshot/queries'
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

  head.createEl('button', { text: t('ui.rename') }).addEventListener('click', () => {
    promptRename(ctx, 'prompt.renameCategory', 'wizard.confirm.renameCategory', category.name,
      () => categoryRenameImpact(ledger.snapshot, category.name),
      (to) => ledger.categories.renameCategory(category.name, to))
  })

  head.createEl('button', { text: t('ui.delete'), cls: 'mod-warning' }).addEventListener('click', () => {
    confirmDelete(ctx, category.subcategories.map(s => s.name), 'confirm.deleteCategory',
      tn('migrate.titleCategory', { name: category.name }),
      (migrateTo) => ledger.categories.removeCategory(category.name, migrateTo))
  })

  if (category.subcategories.length === 0) {
    block.createEl('p', { text: tn('wizard.emptyCategory', { name: category.name }), cls: 'ne-wizard-error' })
  }
  const tags = block.createDiv('ne-category-tags')
  for (const sub of category.subcategories) renderSubcategory(tags, ctx, category, sub)
  let newType: TransactionType = 'expense'
  renderAddRow(block, t('settings.subcategoryPlaceholder'), t('settings.addSubcategory'), (name) => {
    void runAction(ctx, () => ledger.categories.addSubcategory(category.name, name, newType))
  }, (row) => {
    const select = row.createEl('select', { cls: 'dropdown' })
    for (const type of TRANSACTION_TYPES) select.createEl('option', { value: type, text: t(`label.type.${type}`) })
    select.addEventListener('change', () => { newType = select.value as TransactionType })
  })
}

// Changes the subcategory's type after a confirmation. It stays locked while transactions use it;
// a declined change puts the selector back as it was.
function renderTypeSelect(chip: HTMLElement, ctx: WizardContext, sub: Subcategory): void {
  const { ledger, app } = ctx
  const select = chip.createEl('select', { cls: 'dropdown ne-category-type' })
  for (const type of TRANSACTION_TYPES) select.createEl('option', { value: type, text: t(`label.type.${type}`) })
  select.value = sub.type

  if (subcategoryTypeLocked(ledger.snapshot, sub.name)) {
    select.disabled = true
    select.title = t('wizard.typeLocked.used')
    return
  }
  select.addEventListener('change', () => {
    const to = select.value as TransactionType
    const message = tn('wizard.confirm.changeType', {
      name: sub.name, from: t(`label.type.${sub.type}`).toLowerCase(), to: t(`label.type.${to}`).toLowerCase(),
    })
    new ConfirmModal(
      app,
      message,
      () => runAction(ctx, () => ledger.categories.setSubcategoryType(sub.name, to), t('notice.typeChanged')),
      () => { select.value = sub.type },
    ).open()
  })
}

// Picks the loan this debt payment subcategory pays; that is what ties it to the loan and makes it
// show up in the budget. There is no "none": until a loan is chosen the placeholder is shown.
function renderPaymentAccount(chip: HTMLElement, ctx: WizardContext, sub: string): void {
  const { ledger } = ctx
  const loans = ledger.snapshot.accounts.map(a => a.account).filter(a => a.active && a.accountType === 'loan')
  const select = chip.createEl('select', { cls: 'dropdown ne-category-type', attr: { title: t('wizard.paysAccount') } })
  const placeholder = select.createEl('option', { value: '', text: loans.length === 0 ? t('wizard.paysNoLoans') : t('wizard.paysNone') })
  placeholder.disabled = true
  for (const account of loans) select.createEl('option', { value: account.name, text: tn('wizard.paysAccountOption', { name: account.name }) })
  select.value = loans.find(a => a.paymentSubcategory === sub)?.name ?? ''
  select.disabled = loans.length === 0
  select.addEventListener('change', () => {
    void runAction(ctx, () => ledger.accounts.setPaymentAccount(sub, select.value))
  })
}

function renderSubcategory(tags: HTMLElement, ctx: WizardContext, category: Category, sub: Subcategory): void {
  const { ledger } = ctx
  const chip = tags.createDiv('ne-category-tag')
  chip.createEl('span', { text: sub.name })
  renderTypeSelect(chip, ctx, sub)
  if (sub.type === 'debt') renderPaymentAccount(chip, ctx, sub.name)
  if (sub.name === miscName(category.name)) return // Misc follows its category: renamed and removed with it

  iconButton(chip, '✎', () => {
    promptRename(ctx, 'prompt.renameSubcategory', 'wizard.confirm.renameSubcategory', sub.name,
      () => subcategoryRenameImpact(ledger.snapshot, sub.name),
      (to) => ledger.categories.renameSubcategory(sub.name, to))
  })
  iconButton(chip, '×', () => {
    confirmDelete(ctx, [sub.name], 'confirm.deleteSubcategory',
      tn('migrate.titleSubcategory', { name: sub.name }),
      (migrateTo) => ledger.categories.removeSubcategory(sub.name, migrateTo))
  })
}

// Unused subcategories are deleted after a plain confirm. Used ones first ask where their
// transactions should point; the removal then moves them and deletes in one go.
function confirmDelete(
  ctx: WizardContext,
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
  // Transactions can only move to a subcategory of their own type; the first used one decides it.
  const index = buildCategoryIndex(categories)
  const type = index.typeOf(removed.find(s => subcategoryUsage(ledger.snapshot, s) > 0) ?? removed[0]) ?? 'expense'
  new SubcategoryPickModal(app, {
    title,
    intro: tn('migrate.intro', { transactions: String(impact.transactions), files: String(impact.files) }),
    label: t('migrate.target'),
    confirmText: t('migrate.confirm'),
    emptyText: tn('migrate.none', { type: t(`label.type.${type}`).toLowerCase() }),
    targets: migrationTargets(categories, type, removed),
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
