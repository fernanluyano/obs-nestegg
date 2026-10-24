import { percentPaid, type PayoffChart } from '../domain/loans'
import { formatChange, formatPercent, type GrowthPoint } from '../domain/growth'
import { formatCents } from '../domain/money'
import { shiftMonth, thisMonth } from '../helpers'
import { monthWithYear, t, tn } from '../labels'
import {
  Chart,
  BarElement, BarController,
  LineElement, LineController, PointElement,
  ArcElement, PieController,
  CategoryScale, LinearScale,
  Tooltip, Legend, Filler,
  type ChartConfiguration,
} from 'chart.js'
import ChartDataLabels, { type Context as DatalabelsContext } from 'chartjs-plugin-datalabels'

Chart.register(
  BarElement, BarController,
  LineElement, LineController, PointElement,
  ArcElement, PieController,
  CategoryScale, LinearScale,
  Tooltip, Legend, Filler,
  ChartDataLabels,
)

const OTHER_SLICE = '__other__'
const MIN_SLICE_PERCENT = 1

export interface IncomeExpenseMonth {
  monthLabel: string
  tooltipLabel: string
  income: number
  expense: number
  net: number | null
}

// ─── Palette ──────────────────────────────────────────────────────────────────

type PaletteSource = [variable: string, fallback: string] | string

const PIE_SOURCES: PaletteSource[] = [
  ['--ne-expense', '#EF9F27'], ['--ne-bank', '#378ADD'], ['--ne-payment', '#AFA9EC'], ['--ne-cash', '#1D9E75'],
  ['--ne-income', '#5DCAA5'], ['--ne-transfer', '#85B7EB'], ['--ne-credit', '#D85A30'], '#888780',
]

export function readChartPalette() {
  // A Nestegg theme overrides colours on the view, not on body, so read them from the view.
  const style = getComputedStyle(document.querySelector('.view-content.ne-scope') ?? document.body)
  const read = (variable: string, fallback: string) => style.getPropertyValue(variable).trim() || fallback
  const scheme = style.getPropertyValue('--ne-scheme').trim()
  const dark = scheme ? scheme === 'dark' : document.body.classList.contains('theme-dark')
  return {
    income:  read('--ne-income',  '#5DCAA5'),
    expense: read('--ne-expense', '#EF9F27'),
    net:     read('--ne-payment', '#AFA9EC'),
    muted:   dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)',
    label:   dark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)',
    grid:    dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
    pie: PIE_SOURCES.map(source => Array.isArray(source) ? read(source[0], source[1]) : source),
  }
}

type Palette = ReturnType<typeof readChartPalette>

// Dollar amounts from $10,000 up are shortened to "Nk"; smaller ones keep their cents.
export function compactMoney(cents: number): string {
  return Math.abs(cents) >= 1000000
    ? Math.round(cents / 100000) + 'k'
    : formatCents(Math.abs(cents))
}

// The category axis shared by every chart: no line, no grid, muted labels.
const monthAxis = (palette: Palette, extraTicks: object = {}) => ({
  border: { display: false },
  grid: { display: false },
  ticks: { color: palette.muted, ...extraTicks },
})

// ─── Month ranges ─────────────────────────────────────────────────────────────

/** The `count` months ending at (and including) `lastMonth`, oldest first. */
export function monthsEndingAt(lastMonth: string, count: number): string[] {
  const months: string[] = []
  for (let back = count - 1; back >= 0; back--) months.push(shiftMonth(lastMonth, -back))
  return months
}

/** The `count` months ending at the current month, oldest first. */
export function recentMonths(count: number): string[] {
  return monthsEndingAt(thisMonth(), count)
}

// ─── Income / expense bars ────────────────────────────────────────────────────

export function drawCashFlowBars(parent: HTMLElement, months: IncomeExpenseMonth[]): Chart {
  const palette = readChartPalette()

  const biggestIncome = Math.max(...months.map(m => m.income), 1)
  const biggestExpense = Math.max(...months.map(m => m.expense), 1)
  const ceiling = Math.ceil(biggestIncome * 1.1 / 10000) * 10000
  const floor = -Math.ceil(biggestExpense * 1.1 / 10000) * 10000

  const canvas = parent.createEl('canvas')

  const bars = (label: string, values: number[], color: string) => ({
    label,
    data: values,
    backgroundColor: color,
    borderWidth: 0,
    maxBarThickness: 56,
    stack: 'cf',
  })

  const config: ChartConfiguration<'bar'> = {
    type: 'bar',
    data: {
      labels: months.map(m => m.monthLabel),
      datasets: [
        bars(t('dash.income'), months.map(m => m.income), palette.income),
        bars(t('dash.expense'), months.map(m => -m.expense), palette.expense),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // Hovering anywhere in a month shows both bars and the surplus, not just the bar under the cursor.
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'start',
          labels: { color: palette.label, boxWidth: 12, boxHeight: 12, padding: 12 },
        },
        tooltip: {
          callbacks: {
            label: (item) => `${item.dataset.label ?? ''}: ${compactMoney(item.raw as number)}`,
            footer: (items) => {
              const month = months[items[0].dataIndex]
              return `${t('dash.surplus')}: ${formatCents(month.income - month.expense)}`
            },
          },
        },
        datalabels: {
          color: palette.label,
          clip: false,
          anchor: (ctx: DatalabelsContext) => {
            const value = ctx.chart.data.datasets[ctx.datasetIndex].data[ctx.dataIndex] as number
            return value >= 0 ? 'end' : 'start'
          },
          align: (ctx: DatalabelsContext) => {
            const value = ctx.chart.data.datasets[ctx.datasetIndex].data[ctx.dataIndex] as number
            return value >= 0 ? 'top' : 'bottom'
          },
          offset: 2,
          formatter: (value: number) => value !== 0 ? compactMoney(value) : '',
          font: { size: 10, weight: 'bold' },
        },
      },
      scales: {
        x: { stacked: true, ...monthAxis(palette) },
        y: {
          stacked: true,
          min: floor,
          max: ceiling,
          border: { display: false },
          grid: {
            color: (ctx) =>
              ctx.tick.value === 0 ? palette.grid.replace('0.07', '0.14') : palette.grid,
          },
          ticks: {
            color: palette.muted,
            callback: (value) => {
              const cents = value as number
              return cents === 0 ? '0' : compactMoney(cents)
            },
          },
        },
      },
    },
  }

  return new Chart(canvas, config)
}

// ─── Net worth lines: assets, liabilities and their difference ────────────────

export interface NetWorthPoint {
  monthLabel: string
  tooltipLabel: string
  assetsCents: number
  liabilitiesCents: number
  netCents: number
  changeCents: number | null // net worth against the previous month
  changeRatio: number | null
  yoyRatio: number | null
}

// Shared by the chart lines and the legend above it, so a dot always matches its line.
export function netWorthPalette() {
  const palette = readChartPalette()
  return { assets: palette.income, liabilities: palette.expense, net: palette.net }
}

// Plain money axis shared by the line charts.
const moneyAxis = (palette: Palette) => ({
  border: { display: false },
  grid: { color: palette.grid },
  ticks: { color: palette.muted, callback: (value: number | string) => compactMoney(value as number) },
})

const lineSeries = (label: string, color: string, values: number[]) => ({
  label,
  data: values,
  borderColor: color,
  pointBackgroundColor: color,
  pointRadius: 4,
  pointHoverRadius: 6,
  fill: false,
  tension: 0.3,
  spanGaps: false,
})

export function drawNetWorthLines(parent: HTMLElement, points: NetWorthPoint[]): Chart {
  const palette = readChartPalette()
  const colors = netWorthPalette()
  const canvas = parent.createEl('canvas')

  const config: ChartConfiguration<'line'> = {
    type: 'line',
    data: {
      labels: points.map(p => p.monthLabel),
      datasets: [
        lineSeries(t('networth.assets'), colors.assets, points.map(p => p.assetsCents)),
        lineSeries(t('networth.liabilities'), colors.liabilities, points.map(p => p.liabilitiesCents)),
        lineSeries(t('networth.net'), colors.net, points.map(p => p.netCents)),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => points[items[0].dataIndex].tooltipLabel,
            label: (item) => `${item.dataset.label ?? ''}: ${formatCents(item.raw as number)}`,
            footer: (items) => {
              const point = points[items[0].dataIndex]
              return [
                `${t('networth.net')} ${t('cash.monthOverMonth')}: ${formatChange(point.changeCents, point.changeRatio)}`,
                `${t('networth.net')} ${t('cash.yearOverYear')}: ${formatPercent(point.yoyRatio)}`,
              ]
            },
          },
        },
      },
      scales: { x: monthAxis(palette), y: moneyAxis(palette) },
    },
  }

  return new Chart(canvas, config)
}

// ─── Cash on hand ─────────────────────────────────────────────────────────────

export interface CashPoint extends GrowthPoint {
  monthLabel: string
  tooltipLabel: string
}

export function drawCashLine(parent: HTMLElement, points: CashPoint[]): Chart {
  const palette = readChartPalette()
  const canvas = parent.createEl('canvas')

  const config: ChartConfiguration<'line'> = {
    type: 'line',
    data: {
      labels: points.map(p => p.monthLabel),
      datasets: [lineSeries(t('cash.title'), palette.income, points.map(p => p.cents))],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => points[items[0].dataIndex].tooltipLabel,
            label: (item) => `${t('cash.title')}: ${formatCents(item.raw as number)}`,
            afterLabel: (item) => {
              const point = points[item.dataIndex]
              return [
                `${t('cash.monthOverMonth')}: ${formatChange(point.changeCents, point.changeRatio)}`,
                `${t('cash.yearOverYear')}: ${formatPercent(point.yoyRatio)}`,
              ]
            },
          },
        },
      },
      scales: { x: monthAxis(palette), y: moneyAxis(palette) },
    },
  }

  return new Chart(canvas, config)
}

// ─── Loan payoff ──────────────────────────────────────────────────────────────

// Stacked areas of what is still owed, one layer per loan, down to the kind's last payoff.
export function drawPayoffAreas(parent: HTMLElement, payoff: PayoffChart): Chart {
  const palette = readChartPalette()
  const canvas = parent.createEl('canvas')

  const config: ChartConfiguration<'line'> = {
    type: 'line',
    data: {
      labels: payoff.months.map(month => monthWithYear(month, 'short')),
      datasets: payoff.series.map(series => ({
        label: series.name,
        data: series.balances,
        borderColor: series.color,
        backgroundColor: series.color + '55',
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { color: palette.label, boxWidth: 12, boxHeight: 12, padding: 10 } },
        datalabels: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => {
              const owed = item.raw as number
              const paid = percentPaid(payoff.series[item.datasetIndex].originalCents ?? undefined, owed)
              const text = `${item.dataset.label ?? ''}: ${formatCents(owed)}`
              return paid === null ? text : tn('debt.tooltipPaid', { text, percent: paid.toFixed(1) })
            },
          },
        },
      },
      scales: {
        x: monthAxis(palette, { maxTicksLimit: 6 }),
        y: {
          stacked: true,
          border: { display: false },
          grid: { color: palette.grid },
          ticks: { color: palette.muted, maxTicksLimit: 5, callback: (value) => compactMoney(value as number) },
        },
      },
    },
  }

  return new Chart(canvas, config)
}

// ─── Pie ──────────────────────────────────────────────────────────────────────

// Slices under 1% of the total are folded into one "other" slice, which always comes last.
export function foldSmallSlices(values: Map<string, number>): Map<string, number> {
  if (values.size === 0) return new Map()
  const total = [...values.values()].reduce((sum, value) => sum + value, 0)
  if (total === 0) return new Map()

  const kept = new Map<string, number>()
  let folded = 0
  for (const [key, value] of values) {
    if ((value / total) * 100 >= MIN_SLICE_PERCENT) kept.set(key, value)
    else folded += value
  }
  if (folded > 0) kept.set(OTHER_SLICE, folded)
  return kept
}

export function drawPieWithLegend(
  parent: HTMLElement,
  values: Map<string, number>,
  onSliceClick?: (categoryKey: string) => void,
  size = 200,
): Chart {
  const kept = foldSmallSlices(values)
  const total = [...kept.values()].reduce((sum, value) => sum + value, 0)

  const slices = [...kept].map(([key, value]) => ({
    key,
    label: key === OTHER_SLICE ? t('label.cat.other') : key,
    value,
  }))

  const palette = readChartPalette()
  const sliceColors = slices.map((_, i) => palette.pie[i % palette.pie.length])
  const percentOf = (value: number) => Math.round((value / total) * 100)
  // "Other" navigates with no category filter, which shows everything of that type.
  const keyFor = (slice: { key: string }) => slice.key === OTHER_SLICE ? '' : slice.key

  const wrap = parent.createDiv('ne-pie-wrap')
  // A fixed-size wrapper lets Chart.js stay responsive while keeping a stable size, so touch
  // coordinates come out right on mobile.
  const canvasBox = wrap.createDiv('ne-pie-canvas-wrap')
  canvasBox.style.width  = `${size}px`
  canvasBox.style.height = `${size}px`
  if (onSliceClick) canvasBox.setCssProps({ cursor: 'pointer' })
  const canvas = canvasBox.createEl('canvas')

  const chart = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: slices.map(s => s.label),
      datasets: [{
        data: slices.map(s => s.value),
        backgroundColor: sliceColors,
        borderColor: 'rgba(0,0,0,0.08)',
        borderWidth: 1,
        hoverOffset: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 8 },
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => slices[items[0].dataIndex].label,
            label: (item) => {
              const slice = slices[item.dataIndex]
              return `${formatCents(slice.value)} (${percentOf(slice.value)}%)`
            },
          },
        },
      },
      onClick: onSliceClick
        ? (_, elements) => {
            if (!elements.length) return
            onSliceClick(keyFor(slices[elements[0].index]))
          }
        : undefined,
    },
  })

  // The legend is plain HTML so it inherits the theme's text colour and can be clicked.
  const legend = wrap.createDiv('ne-pie-legend')
  slices.forEach((slice, i) => {
    const row = legend.createDiv('ne-legend-item')
    if (onSliceClick) {
      row.setCssProps({ cursor: 'pointer' })
      row.addEventListener('click', () => onSliceClick(keyFor(slice)))
    }
    const dot = row.createEl('span', { cls: 'ne-legend-dot' })
    dot.setCssProps({ 'background-color': sliceColors[i] })
    row.createEl('span', { text: slice.label, cls: 'ne-legend-name' })
    row.createEl('span', { text: formatCents(slice.value), cls: 'ne-legend-amt' })
    row.createEl('span', { text: `${percentOf(slice.value)}%`, cls: 'ne-legend-pct' })
  })

  return chart
}
