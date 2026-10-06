import { t, tn } from '../../labels'

export interface BulkBarOptions {
  count: number
  allShownSelected: boolean
  // Why changing the subcategory is not possible for this selection, or null when it is.
  reassignBlockedReason: string | null
  onToggleAll: () => void
  onDelete: () => void
  onReassign: () => void
  onDone: () => void
}

// The strip shown while selecting: how many rows are picked and what can be done with them.
export function renderBulkBar(container: HTMLElement, opts: BulkBarOptions): void {
  const bar = container.createDiv('ne-bulk-bar')
  bar.dataset['testid'] = 'bulk-bar'
  bar.createSpan({ text: tn('bulk.count', { count: String(opts.count) }), cls: 'ne-bulk-count' })
  bar.createEl('button', { text: opts.allShownSelected ? t('bulk.clearAll') : t('bulk.selectAll'), cls: 'ne-action-btn' })
    .addEventListener('click', opts.onToggleAll)

  const hasSelection = opts.count > 0
  const reassign = bar.createEl('button', { text: t('bulk.reassign'), cls: 'ne-action-btn' })
  reassign.disabled = !hasSelection || opts.reassignBlockedReason !== null
  if (hasSelection && opts.reassignBlockedReason) reassign.title = opts.reassignBlockedReason
  reassign.addEventListener('click', opts.onReassign)

  const del = bar.createEl('button', { text: t('bulk.delete'), cls: 'ne-action-btn mod-warning' })
  del.disabled = !hasSelection
  del.addEventListener('click', opts.onDelete)

  bar.createEl('button', { text: t('bulk.done'), cls: 'ne-action-btn' }).addEventListener('click', opts.onDone)
}
