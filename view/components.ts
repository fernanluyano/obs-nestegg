import { formatCents } from '../money'

export type MetricVariant = 'income' | 'expense' | 'positive' | 'negative' | 'neutral'

export interface MetricOptions {
  hero?: boolean
}

export function createMetric(
  container: HTMLElement,
  label: string,
  value: number,
  variant: MetricVariant,
  options: MetricOptions = {},
): HTMLElement {
  const { hero = false } = options
  const card = container.createDiv('ne-metric')
  if (hero) {
    card.addClass('ne-metric--hero')
    if (variant !== 'neutral') card.addClass(variant)
  }
  card.createEl('div', { text: label, cls: 'ne-metric-label' })

  const prefix =
    variant === 'income' || variant === 'positive' ? '+' :
    variant === 'expense' || variant === 'negative' ? '-' :
    ''

  const valueClass = variant === 'neutral' ? 'ne-metric-value' : `ne-metric-value ${variant}`

  card.createEl('div', {
    text: prefix + formatCents(Math.abs(value)),
    cls: valueClass,
  })

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
