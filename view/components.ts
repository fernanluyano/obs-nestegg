import { metricText, type CardVariant } from './budgetCards'

export type MetricVariant = CardVariant

export interface MetricOptions {
  hero?: boolean
  compact?: boolean
  hint?: string
  // Colour still follows the variant; only the leading +/- is dropped
  signed?: boolean
}

export function createMetric(
  container: HTMLElement,
  label: string,
  value: number,
  variant: MetricVariant,
  options: MetricOptions = {},
): HTMLElement {
  const { hero = false, compact = false, hint, signed = true } = options
  const card = container.createDiv('ne-metric')
  if (compact) card.addClass('ne-metric--small')
  if (hero) {
    card.addClass('ne-metric--hero')
    if (variant !== 'neutral') card.addClass(variant)
  }
  card.createEl('div', { text: label, cls: 'ne-metric-label' })

  const valueClass = variant === 'neutral' ? 'ne-metric-value' : `ne-metric-value ${variant}`

  card.createEl('div', {
    text: metricText(value, variant, signed),
    cls: valueClass,
  })
  if (hint) card.createEl('div', { text: hint, cls: 'ne-metric-hint' })

  return card
}

export interface CardOptions {
  title?: string
  elevation?: 'flat' | 'raised'
  className?: string
}

export function renderCard(parent: HTMLElement, options: CardOptions = {}): HTMLElement {
  const { title, elevation = 'flat', className } = options
  const classes = ['ne-card']
  if (elevation === 'raised') classes.push('ne-card--raised')
  if (className) classes.push(className)
  const card = parent.createDiv(classes.join(' '))
  if (title) card.createEl('div', { text: title, cls: 'ne-card-title' })
  return card
}
