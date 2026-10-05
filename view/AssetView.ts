import { Events, ItemView, WorkspaceLeaf } from 'obsidian'
import { WalletFile } from '../io/WalletFile'
import { t, formatMonthLabel, formatYearMonth } from '../labels'
import { formatCents } from '../money'
import { renderSharedHeader } from './SharedHeader'
import { Chart } from 'chart.js'
import { MonthData, drawNetChart, drawPie, getMonthRange } from './charts'
import { renderCard } from './components'

export const ASSET_VIEW_TYPE = 'nestegg-asset'

export class AssetView extends ItemView {
  private walletFile: WalletFile
  private range: number = 6
  private charts: Chart[] = []

  private clearCharts() {
    this.charts.forEach(c => c.destroy())
    this.charts = []
  }

  constructor(leaf: WorkspaceLeaf, walletFile: WalletFile) {
    super(leaf)
    this.walletFile = walletFile
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

    const [walletBalances, summaries, netTimeline] = await Promise.all([
      this.walletFile.calculateAllWalletBalances(),
      this.walletFile.getMonthSummaries(months),
      this.walletFile.getNetAssetTimeline(months),
    ])

    const netAsset = this.walletFile.computeNetAsset(walletBalances)

    renderSharedHeader(contentEl, {
      view: this,
      walletFile: this.walletFile,
      activeView: 'asset',
      yearMonth: null,
    })

    // ── 2-column grid ────────────────────────────────────────────────────────
    const grid = contentEl.createDiv('ne-grid-2 ne-asset-grid')

    // ── Left column ─────────────────────────────────────────────────────────
    const leftCol = grid.createDiv('ne-asset-left')

    // Wallet balances card
    const walletCard = renderCard(leftCol, { title: t('dash.walletBalances') })
    const walletList = walletCard.createDiv('ne-wallet-list')

    for (const { wallet, balanceCents: balance } of walletBalances) {
      if (wallet.status === 'archived') continue
      const row = walletList.createDiv('ne-asset-wallet-row')
      const left = row.createDiv('ne-wallet-left')
      left.createEl('span', {
        text: t(`label.walletType.${wallet.type}`),
        cls: `ne-wallet-badge ne-badge-${wallet.type}`,
      })
      left.createEl('span', { text: wallet.name, cls: 'ne-wallet-name' })

      const displayBalance = wallet.type === 'creditCard' ? -balance : balance
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

    // Asset allocation pie (≥2 positive-balance non-credit wallets)
    const assetMap = new Map<string, number>()
    for (const { wallet, balanceCents: balance } of walletBalances) {
      if (wallet.status === 'archived') continue
      if (wallet.type === 'creditCard') continue
      if (balance > 0) assetMap.set(wallet.name, balance)
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
