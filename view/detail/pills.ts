import { t } from '../../labels'

export interface PillOption {
  value: string
  label: string
  colorKey?: string
}

// A row of toggle pills with a leading "All" pill that clears the selection.
export function renderPills(
  container: HTMLElement,
  options: PillOption[],
  selected: ReadonlySet<string>,
  handlers: { onToggle: (value: string) => void; onClear: () => void },
  allLabel: string = t('detail.filterAll'),
): void {
  const add = (text: string, color: string, active: boolean, fn: () => void) => {
    const pill = container.createEl('button', {
      text,
      cls: `ne-pill ne-pill-color-${color}` + (active ? ' is-active' : ''),
    })
    pill.addEventListener('touchend', (e) => { e.preventDefault(); fn() })
    pill.addEventListener('click', fn)
  }
  add(allLabel, 'neutral', selected.size === 0, handlers.onClear)
  for (const opt of options) {
    add(opt.label, opt.colorKey ?? 'neutral', selected.has(opt.value), () => handlers.onToggle(opt.value))
  }
}
