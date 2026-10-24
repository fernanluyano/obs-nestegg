import { DEFAULT_ACCOUNT_COLOR } from '../../domain/colors'
import { formatCents } from '../../domain/money'
import { t } from '../../labels'
import { monthAndDay } from '../../helpers'

const colorOf = (colors: Map<string, string>, account: string) => colors.get(account) ?? DEFAULT_ACCOUNT_COLOR

export interface BalanceLegendOptions {
  hidden: Set<string>
  // Accounts with no transactions file this month have nothing to toggle.
  toggleable: Set<string>
  onToggle: (account: string, shown: boolean) => void
}

export function renderBalanceLegend(
  container: HTMLElement, accounts: string[], colors: Map<string, string>, options: BalanceLegendOptions,
): void {
  const legend = container.createDiv('ne-balance-legend')
  legend.dataset['testid'] = 'balance-legend'
  for (const account of accounts) {
    const off = options.hidden.has(account)
    const item = legend.createSpan('ne-legend-item')
    item.toggleClass('is-off', off)
    item.createSpan('ne-legend-dot').style.background = colorOf(colors, account)
    item.createSpan({ text: account })
    if (!options.toggleable.has(account)) continue
    item.addClass('is-toggle')
    item.title = t(off ? 'detail.balanceShow' : 'detail.balanceHide')
    item.addEventListener('click', () => options.onToggle(account, off))
  }
}

export function renderDayHeader(
  container: HTMLElement,
  date: string,
  balances: Map<string, number> | undefined,
  colors: Map<string, string>,
): void {
  const header = container.createDiv('ne-day-header')
  header.dataset['testid'] = 'day-header'
  header.createEl('span', { text: monthAndDay(date), cls: 'ne-day-date' })
  const list = header.createDiv('ne-day-balances')
  for (const [account, cents] of balances ?? []) {
    list.createEl('span', { text: formatCents(cents), cls: 'ne-day-amount' }).style.color = colorOf(colors, account)
  }
}
