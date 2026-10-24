import { metricText, type CardVariant } from './budgetCards'

export type TileVariant = CardVariant

export interface TileOptions {
  hero?: boolean
  compact?: boolean
  hint?: string
  // The colour still follows the variant; only the leading +/- is dropped.
  signed?: boolean
}

export function buildMetricTile(
  parent: HTMLElement,
  label: string,
  cents: number,
  variant: TileVariant,
  options: TileOptions = {},
): HTMLElement {
  const { hero = false, compact = false, hint, signed = true } = options
  const tile = parent.createDiv('ne-metric')
  if (compact) tile.addClass('ne-metric--small')
  if (hero) {
    tile.addClass('ne-metric--hero')
    if (variant !== 'neutral') tile.addClass(variant)
  }
  tile.createDiv({ text: label, cls: 'ne-metric-label' })
  tile.createDiv({
    text: metricText(cents, variant, signed),
    cls: variant === 'neutral' ? 'ne-metric-value' : `ne-metric-value ${variant}`,
  })
  if (hint) tile.createDiv({ text: hint, cls: 'ne-metric-hint' })
  return tile
}

export interface CardSpec {
  title?: string
  elevation?: 'flat' | 'raised'
  className?: string
}

export function buildCard(parent: HTMLElement, spec: CardSpec = {}): HTMLElement {
  const { title, elevation = 'flat', className } = spec
  const classes = ['ne-card']
  if (elevation === 'raised') classes.push('ne-card--raised')
  if (className) classes.push(className)
  const card = parent.createDiv(classes.join(' '))
  if (title) card.createDiv({ text: title, cls: 'ne-card-title' })
  return card
}
