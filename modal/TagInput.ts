import { addTagToList } from './transactionState'
import { t } from '../labels'

export function buildTagInput(
  tags: string[],
  availableTags: string[],
  onChange: (tags: string[]) => void,
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
  const dropdown = wrapper.createDiv('ne-tag-dropdown')
  dropdown.hide()

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
        return
      case 'invalid':
      case 'duplicate':
        input.value = ''
        dropdown.hide()
        return
      case 'added':
        currentTags = result.next
        onChange(currentTags)
        input.value = ''
        dropdown.hide()
        renderChips()
        if (currentTags.length >= 3) input.setAttribute('disabled', 'true')
        return
    }
  }

  input.addEventListener('input', updateDropdown)
  input.addEventListener('focus', updateDropdown)
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() }
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
