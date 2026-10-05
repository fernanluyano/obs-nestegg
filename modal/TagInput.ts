import { addTagToList, pendingTagProblem } from './transactionState'
import { t } from '../labels'

// `onPending` receives the text still in the box, so the form can refuse to save while it is not a
// valid tag instead of silently leaving it out.
export function buildTagInput(
  tags: string[],
  availableTags: string[],
  onChange: (tags: string[]) => void,
  onPending: (raw: string) => void = () => {},
): HTMLElement {
  let currentTags = [...tags]

  const wrapper = createDiv('ne-tag-input-wrapper')
  wrapper.dataset['testid'] = 'tag-input'
  const chipsEl = wrapper.createDiv('ne-tag-chips')
  const input = wrapper.createEl('input', {
    type: 'text',
    cls: 'ne-tag-input',
    placeholder: t('modal.tagsPlaceholder'),
  })
  input.dataset['testid'] = 'tag-input-field'
  input.setAttribute('enterkeyhint', 'done')
  const errorEl = wrapper.createDiv('ne-tag-error')
  errorEl.hide()
  const dropdown = wrapper.createDiv('ne-tag-dropdown')
  dropdown.hide()

  // Shows why the text in the box can't be a tag, and tells the form what is pending.
  const refreshPending = () => {
    const problem = pendingTagProblem(currentTags, input.value)
    errorEl.setText(problem ? t(problem) : '')
    errorEl.toggle(problem !== null)
    input.toggleClass('is-invalid', problem !== null)
    onPending(input.value)
  }

  const updateDropdown = () => {
    const val = input.value.replace(/^#/, '').toLowerCase()
    const suggestions = availableTags.filter(tag =>
      !currentTags.includes(tag) && (val === '' || tag.toLowerCase().includes(val))
    )
    dropdown.empty()
    if (suggestions.length === 0) { dropdown.hide(); return }
    for (const tag of suggestions) {
      const item = dropdown.createDiv({ cls: 'ne-tag-dropdown-item', text: tag })
      item.addEventListener('mousedown', (e) => { e.preventDefault(); addTag(tag); updateDropdown() })
    }
    const rect = input.getBoundingClientRect()
    dropdown.style.left = `${rect.left}px`
    dropdown.style.top = `${rect.bottom + 2}px`
    dropdown.style.width = `${rect.width}px`
    dropdown.show()
  }

  const renderChips = () => {
    chipsEl.empty()
    for (const tag of currentTags) {
      const chip = chipsEl.createSpan('ne-tag-chip')
      chip.dataset['testid'] = 'tag-chip'
      chip.dataset['tag'] = tag
      chip.createSpan({ text: `#${tag}` })
      const x = chip.createSpan({ text: '×', cls: 'ne-tag-chip-remove' })
      x.dataset['testid'] = 'tag-chip-remove'
      x.addEventListener('click', () => {
        currentTags = currentTags.filter(tg => tg !== tag)
        onChange(currentTags)
        renderChips()
        if (currentTags.length < 3) input.removeAttribute('disabled')
      })
    }
  }

  const addTag = (value?: string) => {
    const result = addTagToList(currentTags, value ?? input.value)
    switch (result.kind) {
      case 'empty':
      case 'max':
        break
      case 'too-long':
      case 'invalid':
        // Keep the text and show the error: dropping it would let the form save without the tag.
        break
      case 'duplicate':
        input.value = ''
        dropdown.hide()
        break
      case 'added':
        currentTags = result.next
        onChange(currentTags)
        input.value = ''
        dropdown.hide()
        renderChips()
        if (currentTags.length >= 3) input.setAttribute('disabled', 'true')
        break
    }
    refreshPending()
  }

  input.addEventListener('input', () => { updateDropdown(); refreshPending() })
  input.addEventListener('focus', updateDropdown)
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    // Space ends a tag like Enter and comma do; tag names can't contain one.
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); addTag() }
    if (e.key === 'Escape') {
      if (!dropdown.isShown()) return
      e.preventDefault()
      e.stopPropagation()
      dropdown.hide()
    }
  })
  input.addEventListener('blur', () => {
    setTimeout(() => dropdown.hide(), 150)
    addTag()
  })

  renderChips()
  if (currentTags.length >= 3) input.setAttribute('disabled', 'true')
  return wrapper
}
