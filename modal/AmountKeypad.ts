import { t } from '../labels'
import type { KeypadKey, KeypadState } from './keypadState'

interface AmountKeypadOptions {
  parentEl: HTMLElement
  initialState: KeypadState
  onKey: (key: KeypadKey) => void
}

const PRESS_RELEASE_MS = 90

const LAYOUT: readonly (readonly KeypadKey[])[] = [
  ['÷', '×', '-', '+'],
  ['7', '8', '9', '='],
  ['4', '5', '6', 'C'],
  ['1', '2', '3', '⌫'],
  ['00', '0', '.', 'done'],
]

function keyClasses(key: KeypadKey): string[] {
  const classes = ['ne-keypad-btn']
  if (key === '+' || key === '-' || key === '×' || key === '÷') classes.push('ne-keypad-operator')
  if (key === 'C' || key === '⌫') classes.push('ne-keypad-clear')
  if (key === '=') classes.push('ne-keypad-equals')
  if (key === 'done') classes.push('ne-keypad-done')
  return classes
}

export class AmountKeypad {
  private readonly root: HTMLElement
  private readonly errorLine: HTMLElement
  private readonly onKey: (key: KeypadKey) => void

  constructor(options: AmountKeypadOptions) {
    this.onKey = options.onKey
    this.root = options.parentEl.createDiv('ne-keypad-pad')
    this.errorLine = this.root.createDiv('ne-keypad-error')
    this.buildGrid()
    this.update(options.initialState)
  }

  update(state: KeypadState) {
    this.errorLine.textContent = state.errorKey ? t(state.errorKey) : ''
    this.errorLine.toggleClass('is-visible', Boolean(state.errorKey))
  }

  remove() {
    this.root.remove()
  }

  private buildGrid() {
    const grid = this.root.createDiv('ne-keypad-grid')
    for (const key of LAYOUT.flat()) {
      const button = grid.createEl('button', {
        cls: keyClasses(key).join(' '),
        text: key === 'done' ? t('keypad.done') : key,
      })
      button.dataset['calculatorKey'] = key
      this.wire(button, key)
    }
  }

  // A touch fires the key on touchend and swallows the click that follows it; the mouse and
  // keyboard fire it from click. The pressed look is held briefly after release so a tap is visible.
  private wire(button: HTMLButtonElement, key: KeypadKey) {
    let tapHandled = false
    let releaseTimer: number | null = null

    const cancelRelease = () => {
      if (releaseTimer === null) return
      window.clearTimeout(releaseTimer)
      releaseTimer = null
    }
    const press = () => {
      cancelRelease()
      button.addClass('is-pressed')
    }
    const release = () => button.removeClass('is-pressed')
    const releaseSoon = () => {
      cancelRelease()
      releaseTimer = window.setTimeout(() => {
        releaseTimer = null
        release()
      }, PRESS_RELEASE_MS)
    }
    const fire = () => {
      this.onKey(key)
      releaseSoon()
    }

    button.addEventListener('touchstart', press, { passive: true })
    button.addEventListener('pointerdown', press)
    button.addEventListener('pointerup', releaseSoon)
    for (const type of ['pointercancel', 'pointerleave', 'touchcancel']) button.addEventListener(type, release)
    button.addEventListener('touchend', (event) => {
      event.preventDefault()
      tapHandled = true
      fire()
    })
    button.addEventListener('click', () => {
      if (tapHandled) {
        tapHandled = false
        return
      }
      fire()
    })
  }
}
