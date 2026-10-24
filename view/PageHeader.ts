import { Events, ItemView, Platform, setIcon } from 'obsidian'
import type { Ledger } from '../services/Ledger'
import { EntryFormModal } from '../modal/EntryFormModal'
import { MobileEntryFormModal } from '../modal/MobileEntryFormModal'
import { CategoriesModal } from '../modal/CategoriesModal'
import { t } from '../labels'
import { shiftMonth, isFutureMonth } from '../helpers'
import { NESTEGG_ICON } from '../plugin/icon'
import { BUDGET_VIEW_TYPE } from './BudgetView'
import { OVERVIEW_VIEW_TYPE } from './OverviewView'
import { NETWORTH_VIEW_TYPE } from './NetWorthView'
import { ACCOUNTS_VIEW_TYPE } from './AccountsView'
import { TRANSACTIONS_VIEW_TYPE } from './TransactionsView'
import { openOrRevealView } from './openView'

export type PageId = 'dashboard' | 'networth' | 'accounts' | 'detail' | 'budget'

export interface PageHeaderOptions {
  owner: ItemView
  ledger: Ledger
  page: PageId
  month: string | null
  onMonth?: (month: string) => void
  freezeMonth?: boolean
}

interface PageLink {
  id: PageId
  label: string
  icon: string
  viewType: string
  state?: Record<string, unknown>
}

// Two siblings that the view's stylesheet places in a grid: the navigation (a side rail on wide
// panes, a bottom bar on phones) and the top bar with the page title, month and primary action.
export function drawPageHeader(parent: HTMLElement, options: PageHeaderOptions): void {
  // Marks the view as a themed surface (see paletteVars and the token block in styles.css).
  parent.addClass('ne-scope')
  const { owner, ledger, page, month } = options
  const monthState = month ? { yearMonth: month } : undefined
  const links = ([
    { id: 'dashboard', label: t('ui.overview'), icon: 'layout-dashboard', viewType: OVERVIEW_VIEW_TYPE },
    { id: 'detail',    label: t('ui.detail'),   icon: 'list',             viewType: TRANSACTIONS_VIEW_TYPE, state: monthState },
    { id: 'budget',    label: t('ui.budget'),   icon: 'pie-chart',        viewType: BUDGET_VIEW_TYPE, state: monthState },
    { id: 'accounts',  label: t('ui.accounts'), icon: 'wallet',           viewType: ACCOUNTS_VIEW_TYPE },
    { id: 'networth',  label: t('ui.netWorth'), icon: 'landmark',         viewType: NETWORTH_VIEW_TYPE },
  ] as PageLink[]).sort((a, b) => a.label.localeCompare(b.label))

  const nav = parent.createEl('nav', { cls: 'ne-nav' })
  const brand = nav.createDiv('ne-nav-brand')
  setIcon(brand.createSpan('ne-nav-brand-icon'), NESTEGG_ICON)
  brand.createSpan({ text: 'Nestegg', cls: 'ne-nav-brand-name' })

  const tabs = nav.createDiv({ cls: 'ne-nav-list', attr: { role: 'tablist' } })
  for (const link of links) {
    const current = page === link.id
    const tab = tabs.createEl('button', {
      cls: 'ne-nav-item' + (current ? ' is-active' : ''),
      attr: { role: 'tab', 'aria-selected': String(current) },
    })
    setIcon(tab.createSpan('ne-nav-item-icon'), link.icon)
    tab.createSpan({ text: link.label, cls: 'ne-nav-item-label' })
    if (!current) {
      tab.addEventListener('click', () => { void openOrRevealView(owner.app, link.viewType, link.state) })
    }
  }

  const topBar = parent.createDiv('ne-topbar')
  topBar.createEl('h1', { text: links.find(link => link.id === page)?.label ?? '', cls: 'ne-topbar-title' })

  const monthBox = topBar.createDiv('ne-topbar-month')
  if (month !== null) {
    const frozen = options.freezeMonth === true
    if (frozen) monthBox.addClass('is-disabled')

    const earlier = monthBox.createEl('button', { text: '‹', cls: 'ne-nav-btn', attr: { 'aria-label': t('ui.previousMonth') } })
    monthBox.createEl('span', { text: month, cls: 'ne-month-label' })
    const later = monthBox.createEl('button', { text: '›', cls: 'ne-nav-btn', attr: { 'aria-label': t('ui.nextMonth') } })
    earlier.disabled = frozen
    later.disabled = frozen || isFutureMonth(shiftMonth(month, 1))

    earlier.addEventListener('click', () => {
      if (!earlier.disabled) options.onMonth?.(shiftMonth(month, -1))
    })
    later.addEventListener('click', () => {
      if (!later.disabled) options.onMonth?.(shiftMonth(month, 1))
    })
  } else {
    monthBox.addClass('is-empty')
  }

  if (page !== 'detail' && page !== 'budget') return

  if (page === 'budget') {
    const manage = topBar.createEl('button', { cls: 'ne-manage-btn', attr: { 'aria-label': t('budget.manageCategories') } })
    setIcon(manage.createSpan('ne-manage-icon'), 'tags')
    manage.createSpan({ text: t('budget.manageCategories'), cls: 'ne-manage-label' })
    manage.addEventListener('click', () => new CategoriesModal(owner.app, ledger).open())
  }

  const addButton = topBar.createEl('button', {
    cls: 'ne-add-btn',
    attr: { 'aria-label': t('ui.addTransaction') },
  })
  addButton.createSpan({ text: '+', cls: 'ne-add-icon' })
  addButton.createSpan({ text: t('ui.addTransaction'), cls: 'ne-add-label' })
  addButton.addEventListener('click', () => {
    addButton.disabled = true
    const FormModal = Platform.isMobile ? MobileEntryFormModal : EntryFormModal
    new FormModal(owner.app, ledger, {}, null,
      () => (owner.app.workspace as Events).trigger('nestegg:refresh'),
      () => { addButton.disabled = false },
    ).open()
  })
}
