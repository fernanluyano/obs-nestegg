import { percentPaid, type PayoffChart } from '../domain/loans'
import { formatCents } from '../domain/money'
import { formatYearMonth, t, tn } from '../labels'
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

export interface MonthData {
  monthLabel: string
  tooltipLabel: string
  income: number
  expense: number
  net: number | null
}

// ─── Color helpers ────────────────────────────────────────────────────────────

export function getThemeColors() {
  const s = getComputedStyle(document.body)
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
  const dark = document.body.classList.contains('theme-dark')
  return {
    income:  v('--ne-income',  '#5DCAA5'),
    expense: v('--ne-expense', '#EF9F27'),
    net:     v('--ne-payment', '#AFA9EC'),
    muted:   dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)',
    label:   dark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)',
    grid:    dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
    pie: [
      ['--ne-expense', '#EF9F27'], ['--ne-bank', '#378ADD'], ['--ne-payment', '#AFA9EC'], ['--ne-cash', '#1D9E75'],
      ['--ne-income', '#5DCAA5'], ['--ne-transfer', '#85B7EB'], ['--ne-credit', '#D85A30'], '#888780',
    ].map(entry => Array.isArray(entry) ? v(entry[0], entry[1]) : entry),
  }
}

export function formatK(cents: number): string {
  return Math.abs(cents) >= 1000000
    ? Math.round(cents / 100000) + 'k'
    : formatCents(Math.abs(cents))
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Returns last `count` months ending at (and including) `endYearMonth`. */
export function getMonthRangeEndingAt(endYearMonth: string, count: number): string[] {
  const [y, m] = endYearMonth.split('-').map(Number)
  const result: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1)
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return result
}

/** Returns the last `count` months ending at current month. */
export function getMonthRange(count: number): string[] {
  const result: string[] = []
  const now = new Date()
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return result
}

// ─── Income / Expense bar chart ───────────────────────────────────────────────

export function drawIncExpChart(
  container: HTMLElement,
  data: MonthData[],
): Chart {
  const colors = getThemeColors()

  const maxInc = Math.max(...data.map(d => d.income), 1)
  const maxExp = Math.max(...data.map(d => d.expense), 1)
  const yMax = Math.ceil(maxInc * 1.1 / 10000) * 10000
  const yMin = -Math.ceil(maxExp * 1.1 / 10000) * 10000

  const canvas = container.createEl('canvas')

  const cfg: ChartConfiguration<'bar'> = {
    type: 'bar',
    data: {
      labels: data.map(d => d.monthLabel),
      datasets: [
        {
          label: t('dash.income'),
          data: data.map(d => d.income),
          backgroundColor: colors.income,
          borderWidth: 0,
          maxBarThickness: 56,
          stack: 'cf',
        },
        {
          label: t('dash.expense'),
          data: data.map(d => -d.expense),
          backgroundColor: colors.expense,
          borderWidth: 0,
          maxBarThickness: 56,
          stack: 'cf',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          align: 'start',
          labels: { color: colors.label, boxWidth: 12, boxHeight: 12, padding: 12 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const label = ctx.dataset.label ?? ''
              return `${label}: ${formatK(ctx.raw as number)}`
            },
          },
        },
        datalabels: {
          color: colors.label,
          clip: false,
          anchor: (ctx: DatalabelsContext) => {
            const val = ctx.chart.data.datasets[ctx.datasetIndex].data[ctx.dataIndex] as number
            return val >= 0 ? 'end' : 'start'
          },
          align: (ctx: DatalabelsContext) => {
            const val = ctx.chart.data.datasets[ctx.datasetIndex].data[ctx.dataIndex] as number
            return val >= 0 ? 'top' : 'bottom'
          },
          offset: 2,
          formatter: (v: number) => v !== 0 ? formatK(v) : '',
          font: { size: 10, weight: 'bold' },
        },
      },
      scales: {
        x: {
          stacked: true,
          border: { display: false },
          grid: { display: false },
          ticks: { color: colors.muted },
        },
        y: {
          stacked: true,
          min: yMin,
          max: yMax,
          border: { display: false },
          grid: {
            color: (ctx) =>
              ctx.tick.value === 0 ? colors.grid.replace('0.07', '0.14') : colors.grid,
          },
          ticks: {
            color: colors.muted,
            callback: (v) => {
              const n = v as number
              if (n === 0) return '0'
              return formatK(n)
            },
          },
        },
      },
    },
  }

  return new Chart(canvas, cfg)
}

// ─── Net asset line chart ─────────────────────────────────────────────────────

export function drawNetChart(
  container: HTMLElement,
  data: MonthData[],
): Chart {
  const colors = getThemeColors()

  const canvas = container.createEl('canvas')

  const cfg: ChartConfiguration<'line'> = {
    type: 'line',
    data: {
      labels: data.map(d => d.monthLabel),
      datasets: [
        {
          label: t('dash.netAsset'),
          data: data.map(d => d.net),
          borderColor: colors.net,
          pointBackgroundColor: colors.net,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: false,
          tension: 0.3,
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const idx = items[0].dataIndex
              return data[idx].tooltipLabel
            },
            label: (ctx) => {
              const v = ctx.raw as number | null
              if (v === null) return ''
              return `${t('dash.netAsset')}: ${formatCents(v)}`
            },
          },
        },
      },
      scales: {
        x: {
          border: { display: false },
          grid: { display: false },
          ticks: { color: colors.muted },
        },
        y: {
          border: { display: false },
          grid: { color: colors.grid },
          ticks: {
            color: colors.muted,
            callback: (v) => formatK(v as number),
          },
        },
      },
    },
  }

  return new Chart(canvas, cfg)
}

// ─── Loan payoff chart ────────────────────────────────────────────────────────

// Stacked areas of what is still owed, one layer per loan, down to the kind's last payoff.
export function drawPayoffChart(container: HTMLElement, chart: PayoffChart): Chart {
  const colors = getThemeColors()
  const canvas = container.createEl('canvas')

  const cfg: ChartConfiguration<'line'> = {
    type: 'line',
    data: {
      labels: chart.months.map(m => formatYearMonth(m, 'short')),
      datasets: chart.series.map(s => ({
        label: s.name,
        data: s.balances,
        borderColor: s.color,
        backgroundColor: s.color + '55',
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
        legend: { position: 'bottom', labels: { color: colors.label, boxWidth: 12, boxHeight: 12, padding: 10 } },
        datalabels: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const owed = ctx.raw as number
              const paid = percentPaid(chart.series[ctx.datasetIndex].originalCents ?? undefined, owed)
              const text = `${ctx.dataset.label ?? ''}: ${formatCents(owed)}`
              return paid === null ? text : tn('debt.tooltipPaid', { text, percent: paid.toFixed(1) })
            },
          },
        },
      },
      scales: {
        x: {
          border: { display: false },
          grid: { display: false },
          ticks: { color: colors.muted, maxTicksLimit: 6 },
        },
        y: {
          stacked: true,
          border: { display: false },
          grid: { color: colors.grid },
          ticks: { color: colors.muted, maxTicksLimit: 5, callback: (v) => formatK(v as number) },
        },
      },
    },
  }

  return new Chart(canvas, cfg)
}

// ─── Pie chart ────────────────────────────────────────────────────────────────

export function filterPieData(data: Map<string, number>): Map<string, number> {
  if (data.size === 0) return new Map()
  const total = [...data.values()].reduce((a, b) => a + b, 0)
  if (total === 0) return new Map()

  const filtered = new Map<string, number>()
  let otherTotal = 0

  for (const [key, value] of data) {
    if ((value / total) * 100 >= 1) {
      filtered.set(key, value)
    } else {
      otherTotal += value
    }
  }
  if (otherTotal > 0) filtered.set('__other__', otherTotal)
  return filtered
}

export function drawPie(
  container: HTMLElement,
  data: Map<string, number>,
  onSegmentClick?: (categoryKey: string) => void,
  size = 200,
): Chart {
  const filtered = filterPieData(data)
  const total = [...filtered.values()].reduce((a, b) => a + b, 0)

  const segments: { key: string; label: string; value: number }[] = []
  for (const [key, value] of filtered) {
    segments.push({
      key,
      label: key === '__other__' ? t('label.cat.other') : key,
      value,
    })
  }

  const colors = getThemeColors()
  const segColors = segments.map((_, i) => colors.pie[i % colors.pie.length])

  const wrap = container.createDiv('ne-pie-wrap')
  // Fixed-size wrapper lets Chart.js use responsive:true while keeping a stable size.
  // This ensures touch-event coordinates are computed correctly on mobile.
  const canvasWrap = wrap.createDiv('ne-pie-canvas-wrap')
  canvasWrap.style.width  = `${size}px`
  canvasWrap.style.height = `${size}px`
  if (onSegmentClick) canvasWrap.setCssProps({ cursor: 'pointer' })
  const canvas = canvasWrap.createEl('canvas')

  const chart = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: segments.map(s => s.label),
      datasets: [{
        data: segments.map(s => s.value),
        backgroundColor: segColors,
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
            title: (items) => segments[items[0].dataIndex].label,
            label: (ctx) => {
              const seg = segments[ctx.dataIndex]
              const pct = Math.round((seg.value / total) * 100)
              return `${formatCents(seg.value)} (${pct}%)`
            },
          },
        },
      },
      onClick: onSegmentClick
        ? (_, elements) => {
            if (!elements.length) return
            const seg = segments[elements[0].index]
            // __other__ navigates with no category filter (shows all of that type)
            onSegmentClick(seg.key === '__other__' ? '' : seg.key)
          }
        : undefined,
    },
  })

  // HTML legend — inherits theme text color, supports click navigation
  const legend = wrap.createDiv('ne-pie-legend')
  segments.forEach((seg, i) => {
    const item = legend.createDiv('ne-legend-item')
    if (onSegmentClick) {
      item.setCssProps({ cursor: 'pointer' })
      item.addEventListener('click', () => onSegmentClick(seg.key === '__other__' ? '' : seg.key))
    }
    const dot = item.createEl('span', { cls: 'ne-legend-dot' })
    dot.setCssProps({ 'background-color': segColors[i] })
    item.createEl('span', { text: seg.label, cls: 'ne-legend-name' })
    item.createEl('span', { text: formatCents(seg.value), cls: 'ne-legend-amt' })
    const pct = Math.round((seg.value / total) * 100)
    item.createEl('span', { text: `${pct}%`, cls: 'ne-legend-pct' })
  })

  return chart
}
