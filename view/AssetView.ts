import { Events, ItemView, WorkspaceLeaf } from 'obsidian'
import type { Ledger } from '../services/Ledger'
import { accountBalances, monthSummaries, netAsset as computeNetAsset, netAssetTimeline } from '../snapshot/queries'
import { t, formatMonthLabel, formatYearMonth } from '../labels'
import { formatCents } from '../domain/money'
import { renderSharedHeader } from './SharedHeader'
import { Chart } from 'chart.js'
import { MonthData, drawNetChart, drawPie, getMonthRange } from './charts'
import { renderCard } from './components'

export const ASSET_VIEW_TYPE = 'nestegg-asset'

export class AssetView extends ItemView {
  private ledger: Ledger
  private range: number = 6
  private charts: Chart[] = []

  private clearCharts() {
    this.charts.forEach(c => c.destroy())
    this.charts = []
  }

  constructor(leaf: WorkspaceLeaf, ledger: Ledger) {
    super(leaf)
    this.ledger = ledger
  }

  getViewType() { return ASSET_VIEW_TYPE }
  getDisplayText() { return t('asset.title') }
  getIcon() { return 'wallet' }

  async onOpen() {
    this.registerEvent(
      (this.app.workspace as Events).on('nestegg:refresh', () => { void this.render() })
    )
    this.registerEvent(
      (this.app.workspace as Events).on('css-change', () => { void this.render() })
    )
    await this.render()
  }

  onClose(): Promise<void> {
    this.clearCharts()
    this.contentEl.empty()
    return Promise.resolve()
  }

  async render() {
    const { contentEl } = this
    this.clearCharts()
    const savedScroll = contentEl.scrollTop
    contentEl.empty()
    contentEl.addClass('ne-asset')

    const months = getMonthRange(this.range)

    const { snapshot } = this.ledger
    const balances = accountBalances(snapshot)
    const summaries = monthSummaries(snapshot, months)
    const netTimeline = netAssetTimeline(snapshot, months)
    const netAsset = computeNetAsset(snapshot)

    renderSharedHeader(contentEl, {
      view: this,
      ledger: this.ledger,
      activeView: 'asset',
      yearMonth: null,
    })

    // ── 2-column grid ────────────────────────────────────────────────────────
    const grid = contentEl.createDiv('ne-grid-2 ne-asset-grid')

    // ── Left column ─────────────────────────────────────────────────────────
    const leftCol = grid.createDiv('ne-asset-left')

    // Account balances card
    const walletCard = renderCard(leftCol, { title: t('dash.accountBalances') })
    const walletList = walletCard.createDiv('ne-wallet-list')

    for (const { account, balanceCents: balance } of balances) {
      if (!account.active) continue
      const row = walletList.createDiv('ne-asset-wallet-row')
      const left = row.createDiv('ne-wallet-left')
      left.createEl('span', {
        text: t(`label.accountType.${account.accountType}`),
        cls: `ne-wallet-badge ne-badge-${account.accountType}`,
      })
      left.createEl('span', { text: account.name, cls: 'ne-wallet-name' })

      const displayBalance = account.accountType === 'creditCard' ? -balance : balance
      row.createEl('span', {
        text: formatCents(Math.abs(displayBalance)),
        cls: 'ne-wallet-balance' + (displayBalance < 0 ? ' is-negative' : ''),
      })
    }

    const netRow = walletCard.createDiv('ne-asset-wallet-row ne-net-asset-row')
    netRow.createEl('span', { text: t('dash.netAsset'), cls: 'ne-net-label' })
    netRow.createEl('span', {
      text: formatCents(Math.abs(netAsset)),
      cls: 'ne-net-value' + (netAsset < 0 ? ' is-negative' : ''),
    })

    // Asset allocation pie (≥2 positive-balance non-credit accounts)
    const assetMap = new Map<string, number>()
    for (const { account, balanceCents: balance } of balances) {
      if (!account.active || account.accountType === 'creditCard') continue
      if (balance > 0) assetMap.set(account.name, balance)
    }
    if (assetMap.size >= 2) {
      const assetCard = renderCard(leftCol, { title: t('dash.assetAllocation') })
      this.charts.push(drawPie(assetCard, assetMap))
    }

    // ── Right column ─────────────────────────────────────────────────────────
    const rightCol = grid.createDiv('ne-asset-right')

    // Net asset trend card (with range picker inside)
    const netCard = renderCard(rightCol)  // no title — header row holds it
    const netCardHeader = netCard.createDiv('ne-card-header-row')
    netCardHeader.createEl('div', { text: t('asset.netAssetTrend'), cls: 'ne-card-title' })
    const rangeRow = netCardHeader.createDiv('ne-range-row')
    for (const r of [3, 6, 12]) {
      rangeRow.createEl('button', {
        text: t(`trend.${r}m` as 'trend.3m' | 'trend.6m' | 'trend.12m'),
        cls: 'ne-range-btn' + (this.range === r ? ' is-active' : ''),
      }).addEventListener('click', () => {
        this.range = r
        void this.render()
      })
    }

    const data: MonthData[] = months.map(ym => ({
      monthLabel: formatMonthLabel(ym),
      tooltipLabel: formatYearMonth(ym, 'short'),
      income: summaries.get(ym)?.incomeCents ?? 0,
      expense: summaries.get(ym)?.expenseCents ?? 0,
      net: netTimeline.get(ym) ?? null,
    }))

    const netChartWrap = netCard.createDiv('ne-chart-wrap')
    this.charts.push(drawNetChart(netChartWrap, data))
    contentEl.scrollTop = savedScroll
  }
}
