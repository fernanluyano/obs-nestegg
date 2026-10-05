import { t } from '../labels'
import { filterTagsByQuery, getAddRowState, toggleStagedTag, withNewTag } from './tagPickerState'
import { TAG_LIMIT } from './transactionState'

interface TagPickerParams {
  containerEl: HTMLElement
  availableTags: readonly string[]
  initialSelected: readonly string[]
  onCommit: (selected: string[]) => void
}

export function openTagPicker(params: TagPickerParams): () => void {
  const { containerEl, availableTags, initialSelected, onCommit } = params
  let known = [...availableTags]
  let staged = new Set<string>(initialSelected)
  let query = ''
  let closeTimer: number | null = null

  const backdrop = containerEl.createDiv('ne-bottom-sheet-backdrop')
  const sheet = backdrop.createDiv('ne-bottom-sheet ne-tag-picker')
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
      closeTimer = null
    }, 200)
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close()
  })

  // Top bar
  sheet.createDiv('ne-bottom-sheet-handle')
  const bar = sheet.createDiv('ne-bottom-sheet-bar')
  const cancelBtn = bar.createEl('button', { cls: 'ne-bottom-sheet-btn', text: t('ui.cancel') })
  cancelBtn.dataset['testid'] = 'tag-picker-cancel'
  bar.createEl('span', { cls: 'ne-bottom-sheet-title', text: t('tagPicker.title') })
  const doneBtn = bar.createEl('button', {
    cls: 'ne-bottom-sheet-btn ne-bottom-sheet-btn--done',
    text: t('modal.done'),
  })
  doneBtn.dataset['testid'] = 'tag-picker-done'
  cancelBtn.addEventListener('click', close)
  doneBtn.addEventListener('click', () => {
    onCommit([...staged])
    close()
  })

  // Search row — sized via shared .ne-bottom-sheet-search
  const searchInput = sheet.createEl('input', {
    type: 'text',
    cls: 'ne-bottom-sheet-search',
    placeholder: t('tagPicker.search'),
  })
  searchInput.dataset['testid'] = 'tag-picker-search'

  // Inline add button — sits directly below search (always above the
  // keyboard when it rises). Hidden when search is empty.
  const inlineAdd = sheet.createEl('button', { cls: 'ne-tag-picker-inline-add' })
  inlineAdd.hide()

  // Chip area
  const chipArea = sheet.createDiv('ne-tag-picker-chips')

  // Bottom add row — only visible when search is empty (keyboard is down,
  // so it's reachable). Acts as a hint that tapping focuses search.
  const addRow = sheet.createEl('button', {
    cls: 'ne-tag-picker-add-row',
    text: t('tagPicker.addTag'),
  })

  const renderChips = () => {
    chipArea.empty()
    const visible = filterTagsByQuery(known, query)

    if (visible.length === 0 && query.trim() !== '') {
      chipArea.createDiv({
        cls: 'ne-tag-picker-empty',
        text: t('tagPicker.noResults').replace('{searchTerm}', query.trim()),
      })
      return
    }

    const atLimit = staged.size >= TAG_LIMIT

    for (const tag of visible) {
      const isSelected = staged.has(tag)
      const isDisabled = !isSelected && atLimit
      const chip = chipArea.createEl('button', {
        cls: 'ne-pill ne-pill-color-neutral',
        text: `#${tag}`,
      })
      chip.dataset['testid'] = 'tag-picker-chip'
      chip.dataset['tag'] = tag
      chip.toggleClass('is-active', isSelected)
      chip.toggleClass('is-disabled', isDisabled)

      chip.addEventListener('click', () => {
        if (isDisabled) return
        staged = toggleStagedTag(staged, tag)
        renderChips()
      })
    }
  }

  const renderAddUI = () => {
    const state = getAddRowState(query, known, staged.size)

    // Bottom row only when search is empty (keyboard down → reachable).
    if (state.kind === 'empty') {
      addRow.show()
      inlineAdd.hide()
      return
    }
    addRow.hide()

    // Inline (above-fold) row reflects state when search has content.
    inlineAdd.removeAttribute('disabled')
    inlineAdd.removeClass('is-disabled')
    switch (state.kind) {
      case 'addable':
        inlineAdd.show()
        inlineAdd.setText(t('tagPicker.addNamed').replace('{name}', state.name))
        break
      case 'duplicate':
        // Existing chip will appear in chip area for the user to tap; no
        // need for a separate add affordance.
        inlineAdd.hide()
        break
      case 'limit':
        inlineAdd.show()
        inlineAdd.setText(t('tagPicker.tagLimit'))
        inlineAdd.setAttribute('disabled', 'true')
        inlineAdd.addClass('is-disabled')
        break
      case 'too-long':
        inlineAdd.show()
        inlineAdd.setText(t('tagPicker.tooLong'))
        inlineAdd.setAttribute('disabled', 'true')
        inlineAdd.addClass('is-disabled')
        break
      case 'invalid':
        inlineAdd.show()
        inlineAdd.setText(t('tagPicker.addNamed').replace('{name}', state.name))
        inlineAdd.setAttribute('disabled', 'true')
        inlineAdd.addClass('is-disabled')
        break
    }
  }

  const submitNewTag = () => {
    const state = getAddRowState(query, known, staged.size)
    if (state.kind !== 'addable') return
    known = withNewTag(known, state.name)
    staged.add(state.name)
    searchInput.value = ''
    query = ''
    renderChips()
    renderAddUI()
  }

  searchInput.addEventListener('input', () => {
    query = searchInput.value
    renderChips()
    renderAddUI()
  })
  searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    close()
  })

  // Bottom row is only visible when search is empty; tapping it focuses
  // search to invite typing (the actual add happens via inline button).
  addRow.addEventListener('click', () => {
    searchInput.focus()
  })

  inlineAdd.addEventListener('click', submitNewTag)

  renderChips()
  renderAddUI()
  requestAnimationFrame(() => backdrop.addClass('is-open'))

  return close
}
