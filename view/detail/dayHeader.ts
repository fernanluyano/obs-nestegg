import { DEFAULT_ACCOUNT_COLOR } from '../../domain/colors'
import { formatCents } from '../../domain/money'
import { dateToMonthDay } from '../../utils'

const colorOf = (colors: Map<string, string>, account: string) => colors.get(account) ?? DEFAULT_ACCOUNT_COLOR

export function renderBalanceLegend(container: HTMLElement, accounts: string[], colors: Map<string, string>): void {
  const legend = container.createDiv('ne-balance-legend')
  legend.dataset['testid'] = 'balance-legend'
  for (const account of accounts) {
    const item = legend.createSpan('ne-legend-item')
    item.createSpan('ne-legend-dot').style.background = colorOf(colors, account)
    item.createSpan({ text: account })
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
  header.createEl('span', { text: dateToMonthDay(date), cls: 'ne-day-date' })
  const list = header.createDiv('ne-day-balances')
  for (const [account, cents] of balances ?? []) {
    list.createEl('span', { text: formatCents(cents), cls: 'ne-day-amount' }).style.color = colorOf(colors, account)
  }
}
