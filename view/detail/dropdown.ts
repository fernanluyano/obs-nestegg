import { t } from '../../labels'

export interface DropdownOptions {
  label: string
  allLabel: string
  options: string[]
  selected: Set<string>
  onChange: () => void
  register: (cleanup: () => void) => void
  panelState: { open: boolean }
}

// A multi-select dropdown: clicking an item toggles it and keeps the panel open; a click outside closes it.
export function renderMultiDropdown(container: HTMLElement, o: DropdownOptions): void {
  if (o.options.length === 0) return
  const root = container.createDiv('ne-cat-dropdown')
  const toggleBtn = root.createEl('button', { cls: 'ne-cat-toggle' })
  const panel = root.createDiv('ne-cat-panel')

  const updateLabel = () => {
    const count = o.selected.size
    const badge = count === 0 ? '' : count === 1 ? `: ${[...o.selected][0]}` : ` (${count})`
    toggleBtn.setText(`${o.label}${badge} ${o.panelState.open ? '▴' : '▾'}`)
    toggleBtn.toggleClass('is-active', count > 0)
  }

  const onOutsideClick = (e: MouseEvent) => {
    if (root.contains(e.target as Node)) return
    setOpen(false)
  }
  const setOpen = (open: boolean) => {
    o.panelState.open = open
    panel.toggle(open)
    if (open) document.addEventListener('click', onOutsideClick)
    else document.removeEventListener('click', onOutsideClick)
    updateLabel()
  }
  o.register(() => document.removeEventListener('click', onOutsideClick))

  const buildItems = () => {
    panel.empty()
    const item = (text: string, checked: boolean, onClick: () => void) => {
      const row = panel.createDiv('ne-cat-item')
      const check = row.createEl('span', { cls: 'ne-cat-check' + (checked ? ' is-checked' : '') })
      if (checked) check.setText('✓')
      row.createEl('span', { text })
      row.addEventListener('click', (e) => { e.stopPropagation(); onClick(); buildItems(); updateLabel(); o.onChange() })
    }
    item(o.allLabel, o.selected.size === 0, () => o.selected.clear())
    for (const name of o.options) {
      item(name, o.selected.has(name), () => (o.selected.has(name) ? o.selected.delete(name) : o.selected.add(name)))
    }
  }

  toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!o.panelState.open) })
  buildItems()
  setOpen(o.panelState.open)
}

export const categoryDropdownLabels = () => ({ label: t('detail.filterCategory'), allLabel: t('detail.filterAll') })
export const accountDropdownLabels = () => ({ label: t('detail.filterAccount'), allLabel: t('detail.filterAllAccounts') })
