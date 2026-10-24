import { centsToDecimal, parseCents } from '../domain/money'

const MAX_FRACTION_DIGITS = 2
const OPERATOR_KEYS = ['+', '-', '×', '÷'] as const

export type KeypadOperator = typeof OPERATOR_KEYS[number]
export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | KeypadOperator | '=' | 'C' | '⌫' | '00' | 'done'
export type KeypadErrorKey =
  | 'keypad.err.pendingExpression'
  | 'keypad.err.negativeResult'
  | 'keypad.err.divideByZero'

export interface KeypadState {
  amountValue: string
  expressionText: string
  total: string // the running result once an operator is pending
  operator: KeypadOperator | null
  incoming: string // the number being typed after the operator
  trail: string // the formula so far, ending at the pending operator
  isPendingExpression: boolean
  isResolved: boolean
  errorKey?: KeypadErrorKey
  submitBlocker?: KeypadErrorKey
}

type Fields = Omit<KeypadState, 'submitBlocker'>

// The submit blocker is always a function of the pending flag, so every state goes through here.
function settle(fields: Fields): KeypadState {
  return { ...fields, submitBlocker: fields.isPendingExpression ? 'keypad.err.pendingExpression' : undefined }
}

function revise(state: Fields, changes: Partial<Fields>): KeypadState {
  return settle({ ...state, ...changes })
}

export function newKeypadState(initialAmount = ''): KeypadState {
  return settle({
    amountValue: initialAmount.replace(/^0+(?=\d)/, ''),
    expressionText: '',
    total: '',
    operator: null,
    incoming: '',
    trail: '',
    isPendingExpression: false,
    isResolved: false,
  })
}

function isOperator(key: string): key is KeypadOperator {
  return (OPERATOR_KEYS as readonly string[]).includes(key)
}

export function pressKeypadKey(state: KeypadState, key: string): KeypadState {
  if (key === 'C') return newKeypadState()
  if (key === '=' || key === 'done') return evaluate(state)
  if (key === '⌫') return backspace(state)
  if (key === '00') return typeDigit(typeDigit(state, '0'), '0')
  if (isOperator(key)) return pressOperatorKey(state, key)
  if (key === '.' || /^\d$/.test(key)) return typeDigit(state, key)
  return state
}

function typeDigit(state: KeypadState, key: string): KeypadState {
  const base = state.isResolved ? newKeypadState() : { ...state, errorKey: undefined }

  if (base.operator) {
    const incoming = extendNumber(base.incoming, key)
    return revise(base, {
      incoming,
      amountValue: incoming,
      expressionText: `${base.trail} ${incoming}`,
      isPendingExpression: true,
      isResolved: false,
    })
  }

  return revise(base, {
    amountValue: extendNumber(base.amountValue, key),
    expressionText: '',
    trail: '',
    isPendingExpression: false,
    isResolved: false,
  })
}

// Starts a formula from the number on display.
function openFormula(state: KeypadState, operator: KeypadOperator): KeypadState {
  const trail = `${state.amountValue} ${operator}`
  return revise(state, {
    total: state.amountValue,
    operator,
    incoming: '',
    trail,
    expressionText: trail,
    isPendingExpression: true,
    isResolved: false,
    errorKey: undefined,
  })
}

function pressOperatorKey(state: KeypadState, operator: KeypadOperator): KeypadState {
  if (state.isResolved) return openFormula(state, operator)

  if (!state.operator) return state.amountValue ? openFormula(state, operator) : state

  if (!state.incoming) {
    const trail = state.trail
      ? state.trail.slice(0, -1) + operator
      : `${state.total} ${operator}`
    return revise(state, { operator, trail, expressionText: trail, errorKey: undefined })
  }

  const subtotal = calculate(state.total, state.operator, state.incoming)
  if (subtotal.errorKey) return revise(state, { errorKey: subtotal.errorKey })

  const trail = `${state.trail} ${state.incoming} ${operator}`
  return revise(state, {
    amountValue: subtotal.value,
    total: subtotal.value,
    operator,
    incoming: '',
    trail,
    expressionText: trail,
    isPendingExpression: true,
    isResolved: false,
    errorKey: undefined,
  })
}

function evaluate(state: KeypadState): KeypadState {
  if (!state.operator || !state.total || !state.incoming) return state

  const outcome = calculate(state.total, state.operator, state.incoming)
  if (outcome.errorKey) {
    return revise(state, { errorKey: outcome.errorKey, isPendingExpression: true, isResolved: false })
  }

  return revise(state, {
    amountValue: outcome.value,
    expressionText: '',
    trail: '',
    total: '',
    operator: null,
    incoming: '',
    isPendingExpression: false,
    isResolved: true,
    errorKey: undefined,
  })
}

function backspace(state: KeypadState): KeypadState {
  if (state.isResolved) return state

  if (!state.operator) {
    const shorter = state.amountValue.slice(0, -1)
    if (shorter === state.amountValue) return state
    return revise(state, {
      amountValue: shorter,
      expressionText: '',
      trail: '',
      isPendingExpression: false,
      isResolved: false,
      errorKey: undefined,
    })
  }

  // Nothing typed after the operator: backspace takes the operator back.
  if (!state.incoming) {
    return revise(state, {
      total: '',
      operator: null,
      amountValue: state.total,
      expressionText: '',
      trail: '',
      isPendingExpression: false,
      errorKey: undefined,
    })
  }

  const incoming = state.incoming.slice(0, -1)
  if (incoming === '') {
    return revise(state, {
      incoming: '',
      amountValue: state.total,
      expressionText: state.trail,
      isPendingExpression: true,
      errorKey: undefined,
    })
  }
  return revise(state, {
    incoming,
    amountValue: incoming,
    expressionText: `${state.trail} ${incoming}`,
    isPendingExpression: true,
    errorKey: undefined,
  })
}

function extendNumber(current: string, key: string): string {
  if (key === '.') {
    if (current.includes('.')) return current
    return current === '' ? '0.' : `${current}.`
  }
  const fraction = current.split('.')[1]
  if (fraction !== undefined && fraction.length >= MAX_FRACTION_DIGITS) return current
  return current === '0' ? key : current + key
}

type Calculation = { value: string; errorKey?: never } | { value?: never; errorKey: KeypadErrorKey }

// Both operands become integer cents, so + and - are exact; × and ÷ round to the nearest cent.
function calculate(left: string, operator: KeypadOperator, right: string): Calculation {
  const a = parseCents(left.replace(/\.$/, ''))
  const b = parseCents(right.replace(/\.$/, ''))
  if (a === null || b === null) return { errorKey: 'keypad.err.divideByZero' }

  let cents: number
  switch (operator) {
    case '+': cents = a + b; break
    case '-': cents = a - b; break
    case '×': cents = Math.round(a * b / 100); break
    case '÷':
      if (b === 0) return { errorKey: 'keypad.err.divideByZero' }
      cents = Math.round(a * 100 / b)
      break
  }

  if (cents < 0) return { errorKey: 'keypad.err.negativeResult' }
  return { value: centsToDecimal(cents).replace(/\.?0+$/, '') }
}
