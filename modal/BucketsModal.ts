import { App, Modal, Notice } from 'obsidian'
import { formatCents } from '../domain/money'
import { t, tn } from '../labels'
import type { Ledger } from '../services/Ledger'
import { availability, bucketsOf } from '../snapshot/queries'
import { bucketRowModel, parseAmountText, parseGoalText } from './bucketState'
import { ConfirmDialog } from './ConfirmDialog'

type Action = 'moveIn' | 'moveOut' | 'goal' | 'rename'

// Where the money set aside inside one cash account is managed. Every change is a plain edit of
// the account's bucket table, never a transaction. `run` executes a ledger change and owns
// refreshing the views and reporting failures.
export class BucketsModal extends Modal {
  // The one bucket whose inline editor is open, and what it is for.
  private editing: { bucket: string; action: Action } | null = null

  constructor(
    app: App,
    private ledger: Ledger,
    private account: string,
    private run: (action: () => Promise<void>) => Promise<boolean>,
  ) {
    super(app)
  }

  onOpen() {
    this.containerEl.addClass('ne-scope')
    this.containerEl.addClass('ne-wallet-edit-modal-container')
    this.contentEl.addClass('ne-modal')
    this.render()
  }

  onClose() {
    this.containerEl.removeClass('ne-wallet-edit-modal-container')
    this.contentEl.empty()
  }

  private render() {
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl('h2', { text: tn('buckets.title', { name: this.account }) })

    const amounts = availability(this.ledger.snapshot, this.account)
    if (amounts) {
      const summary = contentEl.createDiv('ne-bucket-summary')
      this.summaryItem(summary, t('buckets.balance'), amounts.balanceCents)
      this.summaryItem(summary, t('buckets.inBuckets'), amounts.bucketsCents)
      this.summaryItem(summary, t('buckets.available'), amounts.availableCents, amounts.availableCents < 0)
    }

    const buckets = bucketsOf(this.ledger.snapshot, this.account)
    if (buckets.length === 0) contentEl.createEl('p', { text: t('buckets.empty'), cls: 'ne-settings-empty' })
    for (const bucket of buckets) this.renderBucket(contentEl, bucket.name)

    this.renderCreate(contentEl)
    contentEl.createDiv('ne-btn-row').createEl('button', { text: t('ui.close') })
      .addEventListener('click', () => this.close())
  }

  private summaryItem(parent: HTMLElement, label: string, cents: number, negative = false) {
    const item = parent.createDiv('ne-bucket-summary-item')
    item.createDiv({ text: label, cls: 'ne-bucket-summary-label' })
    item.createDiv({ text: formatCents(cents), cls: `ne-bucket-summary-value${negative ? ' is-negative' : ''}` })
  }

  private renderBucket(parent: HTMLElement, name: string) {
    const bucket = bucketsOf(this.ledger.snapshot, this.account).find(b => b.name === name)
    if (!bucket) return
    const model = bucketRowModel(bucket)
    const row = parent.createDiv('ne-bucket-row')
    const head = row.createDiv('ne-bucket-head')
    head.createSpan({ text: model.name, cls: 'ne-wallet-row-name' })
    head.createSpan({ text: model.balanceText, cls: 'ne-wallet-row-balance' })
    if (model.percent !== null && model.goalText !== null) {
      const bar = row.createDiv('ne-bucket-bar')
      bar.createDiv('ne-bucket-bar-fill').style.width = `${model.percent}%`
      row.createDiv({ text: tn('buckets.progress', { percent: String(model.percent), goal: model.goalText }), cls: 'ne-wallet-row-desc' })
    } else {
      row.createDiv({ text: t('buckets.noGoal'), cls: 'ne-wallet-row-desc' })
    }

    const actions = row.createDiv('ne-wallet-row-actions ne-bucket-actions')
    const open = (action: Action) => () => { this.editing = { bucket: name, action }; this.render() }
    actions.createEl('button', { text: t('buckets.moveIn') }).addEventListener('click', open('moveIn'))
    actions.createEl('button', { text: t('buckets.moveOut') }).addEventListener('click', open('moveOut'))
    actions.createEl('button', { text: t('buckets.setGoal') }).addEventListener('click', open('goal'))
    actions.createEl('button', { text: t('buckets.rename') }).addEventListener('click', open('rename'))
    actions.createEl('button', { text: t('ui.delete'), cls: 'mod-warning' })
      .addEventListener('click', () => this.confirmDelete(bucket.name, bucket.balanceCents))

    if (this.editing?.bucket === name) this.renderEditor(row, name, this.editing.action, bucket.goalCents)
  }

  private renderEditor(parent: HTMLElement, name: string, action: Action, goalCents: number | undefined) {
    const editor = parent.createDiv('ne-bucket-editor')
    const isName = action === 'rename'
    const input = editor.createEl('input', {
      type: isName ? 'text' : 'number', cls: 'ne-field-input',
      placeholder: isName ? t('buckets.namePlaceholder') : t(action === 'goal' ? 'buckets.goalPlaceholder' : 'buckets.amountPlaceholder'),
    })
    if (!isName) input.setAttribute('step', '0.01')
    if (isName) input.value = name
    if (action === 'goal' && goalCents !== undefined) input.value = String(goalCents / 100)
    const submit = () => void this.submitEditor(name, action, input.value)
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit() })
    const buttons = editor.createDiv('ne-btn-row')
    buttons.createEl('button', { text: t('ui.save'), cls: 'mod-cta' }).addEventListener('click', submit)
    buttons.createEl('button', { text: t('ui.cancel') }).addEventListener('click', () => { this.editing = null; this.render() })
    window.setTimeout(() => input.focus(), 50)
  }

  private async submitEditor(name: string, action: Action, value: string) {
    const { buckets } = this.ledger
    if (action === 'rename') return this.apply(() => buckets.rename(this.account, name, value))
    if (action === 'goal') {
      const goal = parseGoalText(value)
      if (!goal.ok) return void new Notice(t(goal.error))
      return this.apply(() => buckets.setGoal(this.account, name, goal.goalCents))
    }
    const amount = parseAmountText(value)
    if (!amount.ok) return void new Notice(t(amount.error))
    return this.apply(() => action === 'moveIn'
      ? buckets.moveIn(this.account, name, amount.cents)
      : buckets.moveOut(this.account, name, amount.cents))
  }

  private renderCreate(parent: HTMLElement) {
    const form = parent.createDiv('ne-bucket-create')
    form.createEl('h4', { text: t('buckets.new') })
    const name = form.createEl('input', { type: 'text', cls: 'ne-field-input', placeholder: t('buckets.namePlaceholder') })
    const goal = form.createEl('input', { type: 'number', cls: 'ne-field-input', placeholder: t('buckets.goalPlaceholder') })
    goal.setAttribute('step', '0.01')
    const create = async () => {
      const parsed = parseGoalText(goal.value)
      if (!parsed.ok) return void new Notice(t(parsed.error))
      const message = parsed.goalCents === undefined
        ? tn('confirm.createBucket', { name: name.value, account: this.account })
        : tn('confirm.createBucketGoal', { name: name.value, account: this.account, goal: formatCents(parsed.goalCents) })
      new ConfirmDialog(this.app, message, () => this.apply(() => this.ledger.buckets.create(this.account, name.value, parsed.goalCents))).open()
    }
    form.createEl('button', { text: t('buckets.create'), cls: 'mod-cta' }).addEventListener('click', () => void create())
  }

  private confirmDelete(name: string, balanceCents: number) {
    const message = tn('confirm.deleteBucket', { name, amount: formatCents(balanceCents) })
    new ConfirmDialog(this.app, message, () => this.apply(() => this.ledger.buckets.remove(this.account, name))).open()
  }

  private async apply(action: () => Promise<void>) {
    if (await this.run(action)) this.editing = null
    this.render()
  }
}
