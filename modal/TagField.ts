import { tryAddTag, pendingTagProblem, TAG_LIMIT } from './entryDraft'
import { t } from '../labels'

const DROPDOWN_HIDE_DELAY_MS = 150

// `onPending` receives the text still in the box, so the form can refuse to save while it is not a
// valid tag instead of silently leaving it out.
export function createTagField(
  tags: string[],
  suggestions: string[],
  onChange: (tags: string[]) => void,
  onPending: (raw: string) => void = () => {},
): HTMLElement {
  let current = [...tags]

  const root = createDiv('ne-tag-input-wrapper')
  root.dataset['testid'] = 'tag-input'
  const chipRow = root.createDiv('ne-tag-chips')
  const field = root.createEl('input', {
    type: 'text',
    cls: 'ne-tag-input',
    placeholder: t('modal.tagsPlaceholder'),
  })
  field.dataset['testid'] = 'tag-input-field'
  field.setAttribute('enterkeyhint', 'done')
  const problemLine = root.createDiv('ne-tag-error')
  problemLine.hide()
  const menu = root.createDiv('ne-tag-dropdown')
  menu.hide()

  // The box locks once the list is full and unlocks as soon as a tag is removed.
  const lockWhenFull = () => {
    if (current.length >= TAG_LIMIT) field.setAttribute('disabled', 'true')
  }

  // Shows why the text in the box can't be a tag, and tells the form what is pending.
  const syncPending = () => {
    const problem = pendingTagProblem(current, field.value)
    problemLine.setText(problem ? t(problem) : '')
    problemLine.toggle(problem !== null)
    field.toggleClass('is-invalid', problem !== null)
    onPending(field.value)
  }

  const drawMenu = () => {
    const typed = field.value.replace(/^#/, '').toLowerCase()
    const matches = suggestions.filter(tag =>
      !current.includes(tag) && (typed === '' || tag.toLowerCase().includes(typed))
    )
    menu.empty()
    if (matches.length === 0) { menu.hide(); return }
    for (const tag of matches) {
      const entry = menu.createDiv({ cls: 'ne-tag-dropdown-item', text: tag })
      entry.addEventListener('mousedown', (event) => { event.preventDefault(); commit(tag); drawMenu() })
    }
    const box = field.getBoundingClientRect()
    menu.style.left = `${box.left}px`
    menu.style.top = `${box.bottom + 2}px`
    menu.style.width = `${box.width}px`
    menu.show()
  }

  const drawChips = () => {
    chipRow.empty()
    for (const tag of current) {
      const chip = chipRow.createSpan('ne-tag-chip')
      chip.dataset['testid'] = 'tag-chip'
      chip.dataset['tag'] = tag
      chip.createSpan({ text: `#${tag}` })
      const remove = chip.createSpan({ text: '×', cls: 'ne-tag-chip-remove' })
      remove.dataset['testid'] = 'tag-chip-remove'
      remove.addEventListener('click', () => {
        current = current.filter(other => other !== tag)
        onChange(current)
        drawChips()
        if (current.length < TAG_LIMIT) field.removeAttribute('disabled')
      })
    }
  }

  const commit = (value?: string) => {
    const outcome = tryAddTag(current, value ?? field.value)
    // An empty, over-long or invalid entry stays in the box with its error showing: dropping it
    // would let the form save without the tag.
    if (outcome.kind === 'duplicate') {
      field.value = ''
      menu.hide()
    } else if (outcome.kind === 'added') {
      current = outcome.next
      onChange(current)
      field.value = ''
      menu.hide()
      drawChips()
      lockWhenFull()
    }
    syncPending()
  }

  field.addEventListener('input', () => { drawMenu(); syncPending() })
  field.addEventListener('focus', drawMenu)
  field.addEventListener('keydown', (event: KeyboardEvent) => {
    // Space ends a tag like Enter and comma do; tag names can't contain one.
    if (event.key === 'Enter' || event.key === ',' || event.key === ' ') { event.preventDefault(); commit() }
    if (event.key === 'Escape') {
      if (!menu.isShown()) return
      event.preventDefault()
      event.stopPropagation()
      menu.hide()
    }
  })
  field.addEventListener('blur', () => {
    setTimeout(() => menu.hide(), DROPDOWN_HIDE_DELAY_MS)
    commit()
  })

  drawChips()
  lockWhenFull()
  return root
}
