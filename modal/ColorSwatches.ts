import { ACCOUNT_COLORS } from '../domain/colors'

// One round button per palette color; clicking selects it and reports the new value.
export function renderColorSwatches(container: HTMLElement, value: string, onChange: (color: string) => void): void {
  const row = container.createDiv('ne-color-swatches')
  const buttons = new Map<string, HTMLElement>()
  const select = (color: string) => {
    for (const [c, button] of buttons) button.toggleClass('is-selected', c === color)
  }
  for (const color of ACCOUNT_COLORS) {
    const button = row.createEl('button', { cls: 'ne-color-swatch', attr: { type: 'button', 'aria-label': color } })
    button.style.background = color
    button.addEventListener('click', () => { select(color); onChange(color) })
    buttons.set(color, button)
  }
  select(value.toLowerCase())
}
