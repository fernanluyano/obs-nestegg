import { t } from '../labels'

const SLIDE_OUT_MS = 200

export interface SheetChoice {
  key: string
  label: string
}

export function narrowChoices(choices: SheetChoice[], query: string): SheetChoice[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return choices
  return choices.filter(choice =>
    choice.label.toLowerCase().includes(needle) ||
    choice.key.toLowerCase().includes(needle)
  )
}

interface SheetAction {
  label: string
  onClick: (close: () => void) => void
}

export interface SheetFrameOptions {
  containerEl: HTMLElement
  title: string
  leading?: SheetAction | null
  trailing?: SheetAction | null
  onClose?: () => void
  escapesLeaf?: boolean
}

export interface SheetFrame {
  sheet: HTMLElement
  titleEl: HTMLElement
  close: () => void
}

// Locks the page behind the sheet and returns the function that slides it out and unlocks again.
// Calling it twice while the slide-out is running does nothing.
export function lockUntilClosed(backdrop: HTMLElement, host: HTMLElement, onClose?: () => void): () => void {
  document.body.addClass('ne-sheet-lock')
  host.addClass('ne-sheet-active')

  let pending: number | null = null
  const close = () => {
    if (pending !== null) return
    backdrop.addClass('is-closing')
    document.body.removeClass('ne-sheet-lock')
    host.removeClass('ne-sheet-active')
    host.removeClass('ne-phone-text-focus')
    pending = window.setTimeout(() => {
      backdrop.remove()
      onClose?.()
      pending = null
    }, SLIDE_OUT_MS)
  }

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close()
  })
  return close
}

function addBarButton(bar: HTMLElement, label: string, emphasised: boolean, onClick: () => void): void {
  const button = bar.createEl('button', {
    cls: emphasised ? 'ne-sheet-btn ne-sheet-btn--done' : 'ne-sheet-btn',
    text: label,
  })
  button.addEventListener('click', onClick)
}

function slideIn(backdrop: HTMLElement): void {
  window.requestAnimationFrame(() => backdrop.addClass('is-open'))
}

export function openSheetFrame(options: SheetFrameOptions): SheetFrame {
  const { containerEl, title, leading, trailing, onClose, escapesLeaf } = options

  const backdrop = containerEl.createDiv('ne-sheet-backdrop')
  if (escapesLeaf) backdrop.addClass('is-leaf-context')
  const sheet = backdrop.createDiv('ne-sheet')
  const close = lockUntilClosed(backdrop, containerEl, onClose)

  sheet.createDiv('ne-sheet-handle')
  const bar = sheet.createDiv('ne-sheet-bar')

  if (leading) addBarButton(bar, leading.label, false, () => leading.onClick(close))
  else bar.createSpan('ne-sheet-spacer')

  const titleEl = bar.createSpan({ cls: 'ne-sheet-title', text: title })

  if (trailing) addBarButton(bar, trailing.label, true, () => trailing.onClick(close))
  else bar.createSpan('ne-sheet-spacer')

  slideIn(backdrop)
  return { sheet, titleEl, close }
}

interface ChoiceSheetOptions {
  containerEl: HTMLElement
  title: string
  choices: SheetChoice[]
  selected?: string
  searchable?: boolean
  onSelect: (key: string) => void
}

export function openChoiceSheet(options: ChoiceSheetOptions): () => void {
  const { containerEl, title, choices, selected, searchable = false, onSelect } = options

  const { sheet, close } = openSheetFrame({
    containerEl,
    title,
    leading: { label: t('ui.cancel'), onClick: (dismiss) => dismiss() },
  })

  const search = searchable
    ? sheet.createEl('input', { type: 'text', cls: 'ne-sheet-search', placeholder: t('ui.search') })
    : null
  const list = sheet.createDiv('ne-sheet-options')

  const draw = (query: string) => {
    list.empty()
    const matches = narrowChoices(choices, query)
    if (matches.length === 0) {
      list.createDiv({ cls: 'ne-sheet-empty', text: t('ui.noMatches') })
      return
    }
    for (const choice of matches) {
      const button = list.createEl('button', { cls: 'ne-sheet-option', text: choice.label })
      button.dataset['value'] = choice.key
      button.toggleClass('is-selected', choice.key === selected)
      button.addEventListener('click', () => {
        try {
          onSelect(choice.key)
        } finally {
          close()
        }
      })
    }
  }

  search?.addEventListener('input', () => draw(search.value))
  search?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    close()
  })

  draw('')
  return close
}

interface FilterPanelOptions {
  containerEl: HTMLElement
  title: string
  buildBody: (sheet: HTMLElement) => void
  buildFooter?: (footer: HTMLElement) => void
  onCancel: () => void
  onDone: () => void
  onClose?: () => void
}

export function openFilterPanel(options: FilterPanelOptions): () => void {
  const { containerEl, title, onCancel, onDone, onClose } = options

  // The backdrop goes on document.body: position:fixed inside a workspace leaf is trapped by the
  // leaf's transformed ancestor and would not cover Obsidian's toolbar.
  const backdrop = document.body.createDiv('ne-sheet-backdrop is-leaf-context ne-scope')
  const sheet = backdrop.createDiv('ne-sheet ne-filter-sheet')
  const close = lockUntilClosed(backdrop, containerEl, onClose)

  sheet.createDiv('ne-sheet-handle')
  const bar = sheet.createDiv('ne-sheet-bar')
  addBarButton(bar, t('ui.cancel'), false, () => { onCancel(); close() })
  bar.createSpan({ cls: 'ne-sheet-title', text: title })
  addBarButton(bar, t('detail.filterDone'), true, () => { onDone(); close() })

  options.buildBody(sheet.createDiv('ne-filter-sheet-body'))
  if (options.buildFooter) options.buildFooter(sheet.createDiv('ne-filter-sheet-footer'))

  slideIn(backdrop)
  return close
}
