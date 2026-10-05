import { afterEach, describe, it, expect, vi } from 'vitest'
import { filterPieData, formatK, getThemeColors } from '../../view/charts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getThemeColors', () => {
  it('reads chart colors from CSS variables', () => {
    const values = new Map<string, string>([
      ['--ne-income', 'income-var'],
      ['--ne-expense', 'expense-var'],
      ['--ne-bank', 'bank-var'],
      ['--ne-cash', 'cash-var'],
      ['--ne-credit', 'credit-var'],
      ['--ne-transfer', 'transfer-var'],
      ['--ne-payment', 'payment-var'],
      ['--ne-expense-tint', 'expense-tint-var'],
      ['--ne-transfer-tint', 'transfer-tint-var'],
    ])

    vi.stubGlobal('document', {
      documentElement: {},
      body: { classList: { contains: (name: string) => name === 'theme-light' } },
    })
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) => values.get(name) ?? '',
    }))

    const colors = getThemeColors()

    expect(colors.income).toBe('income-var')
    expect(colors.expense).toBe('expense-var')
    expect(colors.net).toBe('payment-var')
    expect(colors.pie).toEqual([
      'expense-var',
      'bank-var',
      'payment-var',
      'cash-var',
      'income-var',
      'transfer-var',
      'credit-var',
      '#888780',
    ])
  })

  it('reads theme overrides from body computed style', () => {
    const body = { classList: { contains: (name: string) => name === 'theme-light' } }
    const documentElement = {}
    const getComputedStyle = vi.fn(() => ({
      getPropertyValue: (name: string) => name,
    }))

    vi.stubGlobal('document', { documentElement, body })
    vi.stubGlobal('getComputedStyle', getComputedStyle)

    getThemeColors()

    expect(getComputedStyle).toHaveBeenCalledWith(body)
  })
})

describe('formatK', () => {
  it('formats values >= $10,000 as Nk', () => {
    expect(formatK(5000000)).toBe('50k')
    expect(formatK(9700000)).toBe('97k')
    expect(formatK(1000000)).toBe('10k')
  })

  it('formats negative values >= $10,000 as -Nk', () => {
    expect(formatK(-5000000)).toBe('-50k')
  })

  it('formats smaller values as grouped dollars (abs)', () => {
    expect(formatK(999999)).toBe('9,999.99')
    expect(formatK(150000)).toBe('1,500.00')
    expect(formatK(-150000)).toBe('1,500.00')
  })
})

describe('filterPieData', () => {
  it('keeps segments >= 1%', () => {
    const data = new Map([['food', 90], ['transport', 10]])
    const result = filterPieData(data)
    expect(result.get('food')).toBe(90)
    expect(result.get('transport')).toBe(10)
    expect(result.has('__other__')).toBe(false)
  })

  it('merges segments < 1% into __other__', () => {
    // total=1000: food=990 (99%), misc=5 (0.5%), fees=5 (0.5%)
    const data = new Map([['food', 990], ['misc', 5], ['fees', 5]])
    const result = filterPieData(data)
    expect(result.get('food')).toBe(990)
    expect(result.has('misc')).toBe(false)
    expect(result.has('fees')).toBe(false)
    expect(result.get('__other__')).toBe(10)
  })

  it('keeps uncategorized ("") if >= 1%', () => {
    const data = new Map([['food', 80], ['', 20]])
    const result = filterPieData(data)
    expect(result.get('')).toBe(20)
    expect(result.has('__other__')).toBe(false)
  })

  it('merges uncategorized ("") into __other__ if < 1%', () => {
    // total=1000: food=999 (99.9%), ''=1 (0.1%)
    const data = new Map([['food', 999], ['', 1]])
    const result = filterPieData(data)
    expect(result.has('')).toBe(false)
    expect(result.get('__other__')).toBe(1)
  })

  it('returns empty map for empty input', () => {
    const result = filterPieData(new Map())
    expect(result.size).toBe(0)
  })

  it('appends __other__ as last key', () => {
    // total=1000: food=900 (90%), tiny=9 (0.9%), transport=91 (9.1%)
    const data = new Map([['food', 900], ['tiny', 9], ['transport', 91]])
    const result = filterPieData(data)
    const keys = [...result.keys()]
    expect(keys[keys.length - 1]).toBe('__other__')
    expect(result.get('__other__')).toBe(9)
  })

  it('returns empty map when all values are zero', () => {
    const data = new Map([['food', 0], ['transport', 0]])
    const result = filterPieData(data)
    expect(result.size).toBe(0)
  })
})
