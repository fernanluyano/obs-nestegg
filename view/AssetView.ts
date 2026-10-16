import { Events, ItemView, Notice, WorkspaceLeaf } from 'obsidian'
import type { Ledger } from '../services/Ledger'
import { activeAssets, assetsByType, assetsTimeline, monthsFromFirstEntry } from '../snapshot/assetQueries'
import type { AssetRecord } from '../snapshot/snapshot'
import { t, tn, formatMonthLabel, formatYearMonth } from '../labels'
import { latestValuation } from '../domain/assets'
import { formatCents } from '../domain/money'
import { AddAssetModal } from '../modal/AddAssetModal'
import { AddValuationModal } from '../modal/AddValuationModal'
import { ConfirmModal } from '../modal/ConfirmModal'
import { EditAssetModal } from '../modal/EditAssetModal'
import { renderSharedHeader } from './SharedHeader'
import { Chart } from 'chart.js'
import { drawAssetsChart, drawPie, getMonthRange } from './charts'
import { NESTEGG_ICON } from '../plugin/icon'
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
  getIcon() { return NESTEGG_ICON }

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

  // Same as the Accounts tab: runs the change, refreshes the views, and tells the caller whether it went through.
  private async run(action: () => Promise<void>, notice?: string): Promise<boolean> {
    try {
      await action()
      if (notice) new Notice(notice)
      this.app.workspace.trigger('nestegg:refresh')
      return true
    } catch (e) {
      new Notice(tn('notice.actionFailed', { reason: e instanceof Error ? e.message : String(e) }))
      return false
    }
  }

  private renderAssetCard(parent: HTMLElement, { asset, valuations }: AssetRecord) {
    const card = parent.createDiv('ne-debt-card')
    const header = card.createDiv('ne-debt-card-header')
    header.createSpan('ne-account-dot').style.background = asset.color
    header.createSpan({ text: asset.name, cls: 'ne-debt-card-name' })
    header.createSpan({ text: t(`label.assetType.${asset.assetType}`), cls: 'ne-debt-card-kind' })

    const latest = latestValuation(valuations)
    const stat = card.createDiv('ne-debt-card-stat')
    stat.createSpan({ text: t('assets.currentValue') })
    stat.createSpan({ text: formatCents(latest?.valueCents ?? 0), cls: 'ne-debt-card-value' })
    if (latest) card.createDiv({ text: tn('assets.valueAsOf', { date: latest.date }), cls: 'ne-debt-card-hint' })
    if (latest?.note) card.createDiv({ text: latest.note, cls: 'ne-asset-note' })

    const actions = card.createDiv('ne-asset-card-actions')
    actions.createEl('button', { text: t('assets.addValuation') })
      .addEventListener('click', () => new AddValuationModal(this.app, this.ledger, asset.name, (a, n) => this.run(a, n)).open())
    actions.createEl('button', { text: t('ui.edit') })
      .addEventListener('click', () => new EditAssetModal(this.app, this.ledger, asset.name, (a, n) => this.run(a, n)).open())
    actions.createEl('button', { text: t('ui.archive'), cls: 'mod-warning' })
      .addEventListener('click', () => {
        new ConfirmModal(this.app, tn('assets.confirmArchive', { name: asset.name }), () => {
          void this.run(() => this.ledger.assets.archive(asset.name), tn('notice.assetArchived', { name: asset.name }))
        }).open()
      })
  }

  async render() {
    const { contentEl } = this
    this.clearCharts()
    const savedScroll = contentEl.scrollTop
    contentEl.empty()
    contentEl.addClass('ne-asset')

    renderSharedHeader(contentEl, {
      view: this,
      ledger: this.ledger,
      activeView: 'asset',
      yearMonth: null,
    })

    const addButton = (parent: HTMLElement) => parent.createDiv('ne-accounts-add').createEl('button', { text: t('assets.add'), cls: 'mod-cta' })
      .addEventListener('click', () => new AddAssetModal(this.app, this.ledger, (a, n) => this.run(a, n)).open())

    const assets = activeAssets(this.ledger.snapshot)
    if (assets.length === 0) {
      const empty = renderCard(contentEl, { title: t('asset.title') })
      empty.createEl('p', { text: t('assets.empty'), cls: 'ne-settings-empty' })
      addButton(empty)
      contentEl.scrollTop = savedScroll
      return
    }

    // Total value graph, with the range picker inside its card
    const months = monthsFromFirstEntry(this.ledger.snapshot, getMonthRange(this.range))
    const timeline = assetsTimeline(this.ledger.snapshot, months)
    const byType = new Map([...assetsByType(this.ledger.snapshot)].map(([type, cents]) => [t(`label.assetType.${type}`), cents]))
    const charts = contentEl.createDiv('ne-assets-charts' + (byType.size > 0 ? '' : ' is-single'))
    const totalCard = renderCard(charts)  // no title — header row holds it
    const totalHeader = totalCard.createDiv('ne-card-header-row')
    totalHeader.createEl('div', { text: t('assets.totalTrend'), cls: 'ne-card-title' })
    const rangeRow = totalHeader.createDiv('ne-range-row')
    for (const r of [3, 6, 12]) {
      rangeRow.createEl('button', {
        text: t(`trend.${r}m` as 'trend.3m' | 'trend.6m' | 'trend.12m'),
        cls: 'ne-range-btn' + (this.range === r ? ' is-active' : ''),
      }).addEventListener('click', () => {
        this.range = r
        void this.render()
      })
    }
    this.charts.push(drawAssetsChart(totalCard.createDiv('ne-chart-wrap'), months.map(ym => ({
      monthLabel: formatMonthLabel(ym),
      tooltipLabel: formatYearMonth(ym, 'short'),
      valueCents: timeline.get(ym) ?? 0,
    }))))

    if (byType.size > 0) {
      this.charts.push(drawPie(renderCard(charts, { title: t('assets.byType') }), byType, undefined, 150))
    }

    const cards = contentEl.createDiv('ne-debt-cards')
    for (const record of assets) this.renderAssetCard(cards, record)
    addButton(contentEl)
    contentEl.scrollTop = savedScroll
  }
}
