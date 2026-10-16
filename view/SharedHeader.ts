import { Events, ItemView, Platform, setIcon } from 'obsidian'
import type { Ledger } from '../services/Ledger'
import { TransactionModal } from '../modal/TransactionModal'
import { MobileTransactionModal } from '../modal/MobileTransactionModal'
import { t } from '../labels'
import { SetupWizard } from '../wizard/SetupWizard'
import { stepMonth, isAfterCurrentMonth } from '../utils'
import { NESTEGG_ICON } from '../plugin/icon'
import { BUDGET_VIEW_TYPE } from './BudgetView'
import { DASHBOARD_VIEW_TYPE } from './DashboardView'
import { ASSET_VIEW_TYPE } from './AssetView'
import { ACCOUNTS_VIEW_TYPE } from './AccountsView'
import { DEBT_VIEW_TYPE } from './DebtView'
import { DETAIL_VIEW_TYPE } from './DetailView'
import { openOrRevealView } from './openView'

export type ActiveView = 'dashboard' | 'asset' | 'accounts' | 'debt' | 'detail' | 'budget'

export type SharedHeaderOptions = {
  view: ItemView
  ledger: Ledger
  activeView: ActiveView
  yearMonth: string | null
  onMonthChange?: (newYearMonth: string) => void
  monthDisabled?: boolean
}

type NavItem = { id: ActiveView; label: string; icon: string; targetType: string; state?: Record<string, unknown> }

// Two siblings that the view's stylesheet places in a grid: the navigation (a side rail on wide
// panes, a bottom bar on phones) and the top bar with the page title, month and primary action.
export function renderSharedHeader(container: HTMLElement, opts: SharedHeaderOptions): void {
  // Marks the view as a themed surface (see paletteVars and the token block in styles.css).
  container.addClass('ne-scope')
  const monthState = opts.yearMonth ? { yearMonth: opts.yearMonth } : undefined
  const items: NavItem[] = [
    { id: 'dashboard', label: t('ui.overview'), icon: 'layout-dashboard', targetType: DASHBOARD_VIEW_TYPE },
    { id: 'detail',    label: t('ui.detail'),   icon: 'list',             targetType: DETAIL_VIEW_TYPE, state: monthState },
    { id: 'budget',    label: t('ui.budget'),   icon: 'pie-chart',        targetType: BUDGET_VIEW_TYPE, state: monthState },
    { id: 'accounts',  label: t('ui.accounts'), icon: 'wallet',           targetType: ACCOUNTS_VIEW_TYPE },
    { id: 'debt',      label: t('ui.debt'),     icon: 'credit-card',      targetType: DEBT_VIEW_TYPE },
    { id: 'asset',     label: t('ui.asset'),    icon: 'home',             targetType: ASSET_VIEW_TYPE },
  ]

  const nav = container.createEl('nav', { cls: 'ne-nav' })
  const brand = nav.createDiv('ne-nav-brand')
  setIcon(brand.createSpan('ne-nav-brand-icon'), NESTEGG_ICON)
  brand.createSpan({ text: 'Nestegg', cls: 'ne-nav-brand-name' })

  const list = nav.createDiv({ cls: 'ne-nav-list', attr: { role: 'tablist' } })
  for (const item of items) {
    const isActive = opts.activeView === item.id
    const btn = list.createEl('button', {
      cls: 'ne-nav-item' + (isActive ? ' is-active' : ''),
      attr: { role: 'tab', 'aria-selected': String(isActive) },
    })
    setIcon(btn.createSpan('ne-nav-item-icon'), item.icon)
    btn.createSpan({ text: item.label, cls: 'ne-nav-item-label' })
    if (!isActive) {
      btn.addEventListener('click', () => { void openOrRevealView(opts.view.app, item.targetType, item.state) })
    }
  }

  const setup = nav.createEl('button', { cls: 'ne-nav-setup' })
  setIcon(setup.createSpan('ne-nav-item-icon'), 'settings')
  setup.createSpan({ text: t('ui.setup'), cls: 'ne-nav-item-label' })
  setup.addEventListener('click', () => new SetupWizard(opts.view.app, opts.ledger).open())

  const bar = container.createDiv('ne-topbar')
  bar.createEl('h1', { text: items.find(i => i.id === opts.activeView)?.label ?? '', cls: 'ne-topbar-title' })

  const monthCell = bar.createDiv('ne-topbar-month')
  if (opts.yearMonth !== null) {
    const ym = opts.yearMonth
    const monthDisabled = opts.monthDisabled === true
    if (monthDisabled) monthCell.addClass('is-disabled')

    const prevBtn = monthCell.createEl('button', { text: '‹', cls: 'ne-nav-btn', attr: { 'aria-label': t('ui.previousMonth') } })
    monthCell.createEl('span', { text: ym, cls: 'ne-month-label' })
    const nextBtn = monthCell.createEl('button', { text: '›', cls: 'ne-nav-btn', attr: { 'aria-label': t('ui.nextMonth') } })
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

  const addBtn = bar.createEl('button', {
    cls: 'ne-add-btn',
    attr: { 'aria-label': t('ui.addTransaction') },
  })
  addBtn.createSpan({ text: '+', cls: 'ne-add-icon' })
  addBtn.createSpan({ text: t('ui.addTransaction'), cls: 'ne-add-label' })
  addBtn.addEventListener('click', () => {
    addBtn.disabled = true
    const ModalClass = Platform.isMobile ? MobileTransactionModal : TransactionModal
    new ModalClass(opts.view.app, opts.ledger, {}, null,
      () => (opts.view.app.workspace as Events).trigger('nestegg:refresh'),
      () => { addBtn.disabled = false },
    ).open()
  })
}
