import { t } from '../labels'

export interface BottomSheetOption {
  key: string
  label: string
}

interface BottomSheetPickerParams {
  containerEl: HTMLElement
  title: string
  options: BottomSheetOption[]
  selected?: string
  searchable?: boolean
  onSelect: (key: string) => void
}

export function filterBottomSheetOptions(
  options: BottomSheetOption[],
  query: string,
): BottomSheetOption[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return options
  return options.filter(option =>
    option.label.toLowerCase().includes(needle) ||
    option.key.toLowerCase().includes(needle)
  )
}

export interface BottomSheetShellParams {
  containerEl: HTMLElement
  title: string
  leftBtn?: { label: string; onClick: (close: () => void) => void } | null
  rightBtn?: { label: string; onClick: (close: () => void) => void } | null
  onClose?: () => void
  leafContext?: boolean
}

export interface BottomSheetShell {
  sheet: HTMLElement
  titleEl: HTMLElement
  close: () => void
}

export function openBottomSheetShell(params: BottomSheetShellParams): BottomSheetShell {
  const { containerEl, title, leftBtn, rightBtn, onClose, leafContext } = params
  let closeTimer: number | null = null

  const backdrop = containerEl.createDiv('ne-bottom-sheet-backdrop')
  if (leafContext) {
    backdrop.addClass('is-leaf-context')
  }
  const sheet = backdrop.createDiv('ne-bottom-sheet')
  document.body.addClass('ne-bottom-sheet-lock')
  containerEl.addClass('ne-bottom-sheet-active')

  const close = () => {
    if (closeTimer !== null) return
    backdrop.addClass('is-closing')
    document.body.removeClass('ne-bottom-sheet-lock')
    containerEl.removeClass('ne-bottom-sheet-active')
    containerEl.removeClass('ne-mobile-text-focus')
    closeTimer = window.setTimeout(() => {
      backdrop.remove()
      onClose?.()
      closeTimer = null
    }, 200)
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close()
  })

  sheet.createDiv('ne-bottom-sheet-handle')
  const bar = sheet.createDiv('ne-bottom-sheet-bar')

  if (leftBtn) {
    const btn = bar.createEl('button', { cls: 'ne-bottom-sheet-btn', text: leftBtn.label })
    btn.addEventListener('click', () => leftBtn.onClick(close))
  } else {
    bar.createSpan('ne-bottom-sheet-spacer')
  }

  const titleEl = bar.createEl('span', { cls: 'ne-bottom-sheet-title', text: title })

  if (rightBtn) {
    const btn = bar.createEl('button', { cls: 'ne-bottom-sheet-btn ne-bottom-sheet-btn--done', text: rightBtn.label })
    btn.addEventListener('click', () => rightBtn.onClick(close))
  } else {
    bar.createSpan('ne-bottom-sheet-spacer')
  }

  requestAnimationFrame(() => backdrop.addClass('is-open'))

  return { sheet, titleEl, close }
}

export function openBottomSheetPicker(params: BottomSheetPickerParams): () => void {
  const { containerEl, title, options, selected, searchable = false, onSelect } = params
  let currentQuery = ''

  const { sheet, close } = openBottomSheetShell({
    containerEl,
    title,
    leftBtn: { label: t('ui.cancel'), onClick: (c) => c() },
  })

  let searchInput: HTMLInputElement | null = null
  if (searchable) {
    searchInput = sheet.createEl('input', {
      type: 'text',
      cls: 'ne-bottom-sheet-search',
      placeholder: t('ui.search'),
    })
  }

  const listEl = sheet.createDiv('ne-bottom-sheet-options')

  const renderOptions = () => {
    listEl.empty()
    const visibleOptions = filterBottomSheetOptions(options, currentQuery)
    if (visibleOptions.length === 0) {
      listEl.createDiv({ cls: 'ne-bottom-sheet-empty', text: t('ui.noMatches') })
      return
    }

    for (const option of visibleOptions) {
      const item = listEl.createEl('button', {
        cls: 'ne-bottom-sheet-option',
        text: option.label,
      })
      item.dataset['value'] = option.key
      item.toggleClass('is-selected', option.key === selected)
      item.addEventListener('click', () => {
        try {
          onSelect(option.key)
        } finally {
          close()
        }
      })
    }
  }

  searchInput?.addEventListener('input', () => {
    currentQuery = searchInput?.value ?? ''
    renderOptions()
  })
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    close()
  })

  renderOptions()

  return close
}

interface FilterSheetParams {
  containerEl: HTMLElement
  title: string
  buildBody: (sheet: HTMLElement) => void
  buildFooter?: (footer: HTMLElement) => void
  onCancel: () => void
  onDone: () => void
  onClose?: () => void
}

export function openFilterSheet(params: FilterSheetParams): () => void {
  const { containerEl, title, onCancel, onDone, onClose } = params
  let closeTimer: number | null = null

  // Leaf context: attach backdrop to document.body so position:fixed escapes
  // the workspace leaf's transformed ancestor and covers the Obsidian toolbar.
  const backdrop = document.body.createDiv('ne-bottom-sheet-backdrop is-leaf-context')
  const sheet = backdrop.createDiv('ne-bottom-sheet ne-filter-sheet')
  document.body.addClass('ne-bottom-sheet-lock')
  containerEl.addClass('ne-bottom-sheet-active')

  const close = () => {
    if (closeTimer !== null) return
    backdrop.addClass('is-closing')
    document.body.removeClass('ne-bottom-sheet-lock')
    containerEl.removeClass('ne-bottom-sheet-active')
    containerEl.removeClass('ne-mobile-text-focus')
    closeTimer = window.setTimeout(() => {
      backdrop.remove()
      onClose?.()
      closeTimer = null
    }, 200)
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close()
  })

  sheet.createDiv('ne-bottom-sheet-handle')
  const bar = sheet.createDiv('ne-bottom-sheet-bar')

  const cancelBtn = bar.createEl('button', { cls: 'ne-bottom-sheet-btn', text: t('ui.cancel') })
  cancelBtn.addEventListener('click', () => { onCancel(); close() })

  bar.createEl('span', { cls: 'ne-bottom-sheet-title', text: title })

  const doneBtn = bar.createEl('button', { cls: 'ne-bottom-sheet-btn ne-bottom-sheet-btn--done', text: t('detail.filterDone') })
  doneBtn.addEventListener('click', () => { onDone(); close() })

  const body = sheet.createDiv('ne-filter-sheet-body')
  params.buildBody(body)

  if (params.buildFooter) {
    const footer = sheet.createDiv('ne-filter-sheet-footer')
    params.buildFooter(footer)
  }

  requestAnimationFrame(() => backdrop.addClass('is-open'))

  return close
}
