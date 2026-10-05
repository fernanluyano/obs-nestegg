import { Events, ItemView, Platform } from 'obsidian'
import { WalletFile } from '../io/WalletFile'
import { TransactionModal } from '../modal/TransactionModal'
import { MobileTransactionModal } from '../modal/MobileTransactionModal'
import { t } from '../labels'
import { stepMonth, isAfterCurrentMonth } from '../utils'
import { DASHBOARD_VIEW_TYPE } from './DashboardView'
import { ASSET_VIEW_TYPE } from './AssetView'
import { DETAIL_VIEW_TYPE } from './DetailView'

export type ActiveView = 'dashboard' | 'asset' | 'detail'

export type SharedHeaderOptions = {
  view: ItemView
  walletFile: WalletFile
  activeView: ActiveView
  yearMonth: string | null
  onMonthChange?: (newYearMonth: string) => void
  monthDisabled?: boolean
}

export function renderSharedHeader(container: HTMLElement, opts: SharedHeaderOptions): void {
  const root = container.createDiv('ne-shared-header')

  const monthCell = root.createDiv('ne-shared-header-month')
  if (opts.yearMonth !== null) {
    const ym = opts.yearMonth
    const monthDisabled = opts.monthDisabled === true
    if (monthDisabled) monthCell.addClass('is-disabled')

    const prevBtn = monthCell.createEl('button', { text: '‹', cls: 'ne-nav-btn' })
    monthCell.createEl('span', { text: ym, cls: 'ne-month-label' })
    const nextBtn = monthCell.createEl('button', { text: '›', cls: 'ne-nav-btn' })
    prevBtn.disabled = monthDisabled
    nextBtn.disabled = monthDisabled || isAfterCurrentMonth(stepMonth(ym, 1))

    prevBtn.addEventListener('click', () => {
      if (!prevBtn.disabled) opts.onMonthChange?.(stepMonth(ym, -1))
    })
    nextBtn.addEventListener('click', () => {
      if (!nextBtn.disabled) opts.onMonthChange?.(stepMonth(ym, 1))
    })
  } else {
    monthCell.addClass('is-empty')
  }

  const tabsCell = root.createDiv('ne-shared-header-tabs')
  const tabs: { id: ActiveView; label: string; targetType: string; state?: Record<string, unknown> }[] = [
    { id: 'dashboard', label: t('ui.overview'), targetType: DASHBOARD_VIEW_TYPE },
    { id: 'asset',     label: t('ui.asset'),    targetType: ASSET_VIEW_TYPE },
    { id: 'detail',    label: t('ui.detail'),   targetType: DETAIL_VIEW_TYPE,
      state: opts.yearMonth ? { yearMonth: opts.yearMonth } : undefined },
  ]
  for (const tab of tabs) {
    const isActive = opts.activeView === tab.id
    const btn = tabsCell.createEl('button', {
      text: tab.label,
      cls: 'ne-shared-header-tab' + (isActive ? ' is-active' : ''),
    })
    if (!isActive) {
      btn.addEventListener('click', () => {
        void openOrRevealView(opts.view, tab.targetType, tab.state)
      })
    }
  }

  const actionsCell = root.createDiv('ne-shared-header-actions')
  const addBtn = actionsCell.createEl('button', {
    text: '+ ' + t('ui.addTransaction'),
    cls: 'ne-action-btn ne-shared-header-add',
  })
  addBtn.addEventListener('click', () => {
    addBtn.disabled = true
    const ModalClass = Platform.isMobile ? MobileTransactionModal : TransactionModal
    new ModalClass(opts.view.app, opts.walletFile, {}, null, null,
      () => (opts.view.app.workspace as Events).trigger('nestegg:refresh'),
      () => { addBtn.disabled = false },
    ).open()
  })
}

async function openOrRevealView(view: ItemView, type: string, state?: Record<string, unknown>) {
  const existing = view.app.workspace.getLeavesOfType(type)
  const leaf = existing[0] ?? view.app.workspace.getLeaf('tab')
  await leaf.setViewState({ type, active: true, state })
  void view.app.workspace.revealLeaf(leaf)
}
