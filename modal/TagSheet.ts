import { t } from '../labels'
import { lockUntilClosed } from './SlideUpSheet'
import { tagsMatching, addPromptFor, toggleChosen, withTag } from './tagSheetState'
import { TAG_LIMIT } from './entryDraft'

interface TagSheetOptions {
  containerEl: HTMLElement
  availableTags: readonly string[]
  initialSelected: readonly string[]
  onCommit: (selected: string[]) => void
}

export function openTagSheet(options: TagSheetOptions): () => void {
  const { containerEl, availableTags, initialSelected, onCommit } = options
  let knownTags = [...availableTags]
  let chosen = new Set<string>(initialSelected)
  let query = ''

  const backdrop = containerEl.createDiv('ne-sheet-backdrop')
  const sheet = backdrop.createDiv('ne-sheet ne-tag-sheet')
  const close = lockUntilClosed(backdrop, containerEl)

  sheet.createDiv('ne-sheet-handle')
  const bar = sheet.createDiv('ne-sheet-bar')
  const cancelButton = bar.createEl('button', { cls: 'ne-sheet-btn', text: t('ui.cancel') })
  cancelButton.dataset['testid'] = 'tag-picker-cancel'
  bar.createEl('span', { cls: 'ne-sheet-title', text: t('tagSheet.title') })
  const doneButton = bar.createEl('button', {
    cls: 'ne-sheet-btn ne-sheet-btn--done',
    text: t('modal.done'),
  })
  doneButton.dataset['testid'] = 'tag-picker-done'
  cancelButton.addEventListener('click', close)
  doneButton.addEventListener('click', () => {
    onCommit([...chosen])
    close()
  })

  const search = sheet.createEl('input', {
    type: 'text',
    cls: 'ne-sheet-search',
    placeholder: t('tagSheet.search'),
  })
  search.dataset['testid'] = 'tag-picker-search'

  // Sits right under the search box so it stays above the keyboard once that rises; hidden while
  // the search is empty.
  const addNow = sheet.createEl('button', { cls: 'ne-tag-sheet-inline-add' })
  addNow.hide()

  const chips = sheet.createDiv('ne-tag-sheet-chips')

  // Only shown while the search is empty, when the keyboard is down; tapping it just focuses the search.
  const addPrompt = sheet.createEl('button', {
    cls: 'ne-tag-sheet-add-row',
    text: t('tagSheet.addTag'),
  })

  const drawChips = () => {
    chips.empty()
    const matches = tagsMatching(knownTags, query)

    if (matches.length === 0 && query.trim() !== '') {
      chips.createDiv({
        cls: 'ne-tag-sheet-empty',
        text: t('tagSheet.noResults').replace('{searchTerm}', query.trim()),
      })
      return
    }

    const full = chosen.size >= TAG_LIMIT

    for (const tag of matches) {
      const picked = chosen.has(tag)
      const blocked = !picked && full
      const chip = chips.createEl('button', {
        cls: 'ne-pill ne-pill-color-neutral',
        text: `#${tag}`,
      })
      chip.dataset['testid'] = 'tag-picker-chip'
      chip.dataset['tag'] = tag
      chip.toggleClass('is-active', picked)
      chip.toggleClass('is-disabled', blocked)

      chip.addEventListener('click', () => {
        if (blocked) return
        chosen = toggleChosen(chosen, tag)
        drawChips()
      })
    }
  }

  const showBlocked = (text: string) => {
    addNow.show()
    addNow.setText(text)
    addNow.setAttribute('disabled', 'true')
    addNow.addClass('is-disabled')
  }

  const drawAddControls = () => {
    const row = addPromptFor(query, knownTags, chosen.size)

    if (row.kind === 'empty') {
      addPrompt.show()
      addNow.hide()
      return
    }
    addPrompt.hide()

    addNow.removeAttribute('disabled')
    addNow.removeClass('is-disabled')
    if (row.kind === 'addable') {
      addNow.show()
      addNow.setText(t('tagSheet.addNamed').replace('{name}', row.name))
    } else if (row.kind === 'duplicate') {
      // The matching chip is already listed above for the user to tap.
      addNow.hide()
    } else if (row.kind === 'limit') {
      showBlocked(t('tagSheet.tagLimit'))
    } else if (row.kind === 'too-long') {
      showBlocked(t('tagSheet.tooLong'))
    } else {
      showBlocked(t('tagSheet.addNamed').replace('{name}', row.name))
    }
  }

  const addTypedTag = () => {
    const row = addPromptFor(query, knownTags, chosen.size)
    if (row.kind !== 'addable') return
    knownTags = withTag(knownTags, row.name)
    chosen.add(row.name)
    search.value = ''
    query = ''
    drawChips()
    drawAddControls()
  }

  search.addEventListener('input', () => {
    query = search.value
    drawChips()
    drawAddControls()
  })
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    close()
  })
  addPrompt.addEventListener('click', () => search.focus())
  addNow.addEventListener('click', addTypedTag)

  drawChips()
  drawAddControls()
  requestAnimationFrame(() => backdrop.addClass('is-open'))

  return close
}
