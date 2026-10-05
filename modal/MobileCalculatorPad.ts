import { t } from '../labels'
import type { MobileCalculatorKey, MobileCalculatorState } from './mobileCalculatorState'

interface MobileCalculatorPadParams {
  parentEl: HTMLElement
  initialState: MobileCalculatorState
  onKey: (key: MobileCalculatorKey) => void
}

const keyRows: MobileCalculatorKey[][] = [
  ['÷', '×', '-', '+'],
  ['7', '8', '9', '='],
  ['4', '5', '6', 'C'],
  ['1', '2', '3', '⌫'],
  ['00', '0', '.', 'done'],
]

export class MobileCalculatorPad {
  private rootEl: HTMLElement
  private errorEl: HTMLElement
  private state: MobileCalculatorState
  private onKey: (key: MobileCalculatorKey) => void

  constructor(params: MobileCalculatorPadParams) {
    this.state = params.initialState
    this.onKey = params.onKey
    this.rootEl = params.parentEl.createDiv('ne-mobile-calculator-pad')
    this.errorEl = this.rootEl.createDiv('ne-mobile-calculator-error')
    this.renderKeys()
    this.update(this.state)
  }

  update(state: MobileCalculatorState) {
    this.state = state
    this.errorEl.textContent = state.errorKey ? t(state.errorKey) : ''
    this.errorEl.toggleClass('is-visible', Boolean(state.errorKey))
  }

  remove() {
    this.rootEl.remove()
  }

  private renderKeys() {
    const gridEl = this.rootEl.createDiv('ne-mobile-calculator-grid')
    for (const row of keyRows) {
      for (const key of row) {
        const btn = gridEl.createEl('button', {
          cls: this.getButtonClass(key),
          text: key === 'done' ? t('calculator.done') : key,
        })
        btn.dataset['calculatorKey'] = key
        this.bindButton(btn, key)
      }
    }
  }

  private getButtonClass(key: MobileCalculatorKey): string {
    const classes = ['ne-mobile-calculator-btn']
    if (['+', '-', '×', '÷'].includes(key)) classes.push('ne-mobile-calculator-operator')
    if (key === 'C' || key === '⌫') classes.push('ne-mobile-calculator-clear')
    if (key === '=') classes.push('ne-mobile-calculator-equals')
    if (key === 'done') classes.push('ne-mobile-calculator-done')
    return classes.join(' ')
  }

  private bindButton(btn: HTMLButtonElement, key: MobileCalculatorKey) {
    let touched = false
    let clearPressedTimer: number | null = null
    const setPressed = () => {
      if (clearPressedTimer !== null) {
        window.clearTimeout(clearPressedTimer)
        clearPressedTimer = null
      }
      btn.addClass('is-pressed')
    }
    const clearPressed = () => {
      btn.removeClass('is-pressed')
    }
    const scheduleClearPressed = () => {
      if (clearPressedTimer !== null) window.clearTimeout(clearPressedTimer)
      clearPressedTimer = window.setTimeout(() => {
        clearPressedTimer = null
        clearPressed()
      }, 90)
    }

    btn.addEventListener('touchstart', setPressed, { passive: true })
    btn.addEventListener('pointerdown', setPressed)
    btn.addEventListener('pointerup', scheduleClearPressed)
    btn.addEventListener('pointercancel', clearPressed)
    btn.addEventListener('pointerleave', clearPressed)
    btn.addEventListener('touchcancel', clearPressed)
    btn.addEventListener('touchend', (e) => {
      e.preventDefault()
      touched = true
      this.onKey(key)
      scheduleClearPressed()
    })
    btn.addEventListener('click', () => {
      if (touched) {
        touched = false
        return
      }
      this.onKey(key)
      scheduleClearPressed()
    })
  }
}
