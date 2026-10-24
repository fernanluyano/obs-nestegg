import { describe, it, expect, vi, afterEach } from 'vitest'
import { shiftMonth, isFutureMonth, MAX_TAG_LENGTH, isValidTag, groupAmount, heroAmountLabel, monthAndDay, thisMonth } from '../../helpers'

// ── shiftMonth ────────────────────────────────────────────────────────────────

describe('shiftMonth', () => {
  it('advances one month', () => {
    expect(shiftMonth('2026-01', 1)).toBe('2026-02')
  })

  it('rolls over year boundary forward', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('rolls back year boundary backward', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('advances multiple months', () => {
    expect(shiftMonth('2026-01', 3)).toBe('2026-04')
  })

  it('delta 0 returns same month', () => {
    expect(shiftMonth('2026-06', 0)).toBe('2026-06')
  })
})

// ── isFutureMonth ─────────────────────────────────────────────────────────────

describe('isFutureMonth', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true for a future month', () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026)
    vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(2) // March (0-indexed)
    expect(isFutureMonth('2026-04')).toBe(true)
  })

  it('returns false for the current month', () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026)
    vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(2) // March
    expect(isFutureMonth('2026-03')).toBe(false)
  })

  it('returns false for a past month', () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026)
    vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(2) // March
    expect(isFutureMonth('2025-12')).toBe(false)
  })
})

// ── thisMonth / monthAndDay ───────────────────────────────────────────────────

describe('thisMonth', () => {
  it('returns a string in YYYY-MM format', () => {
    expect(thisMonth()).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('monthAndDay', () => {
  it('extracts MM/DD from a full date string', () => {
    expect(monthAndDay('2026-04-03')).toBe('04/03')
  })

  it('works for single-digit month and day', () => {
    expect(monthAndDay('2026-01-09')).toBe('01/09')
  })
})

// ── isValidTag ────────────────────────────────────────────────────────────────

describe('isValidTag', () => {
  it('accepts short ASCII tag', () => {
    expect(isValidTag('food')).toBe(true)
  })
  it('accepts a tag of exactly 16 characters', () => {
    expect(isValidTag('abcdefghijklmnop')).toBe(true)
  })
  it('rejects a tag of 17 characters', () => {
    expect(isValidTag('abcdefghijklmnopq')).toBe(false)
  })
  it('accepts letters, digits and dashes', () => {
    expect(isValidTag('need')).toBe(true)
    expect(isValidTag('q3-2026')).toBe(true)
    expect(isValidTag('a-b-c')).toBe(true)
    expect(isValidTag('2026')).toBe(true)
    expect(isValidTag('-')).toBe(true)
  })
  it.each(['under_score', 'dot.ted', 'a/b', 'a&b', 'a!', 'a#b', 'a@b', 'a:b', 'café', 'ñ', '💸'])(
    'rejects %s',
    (tag) => expect(isValidTag(tag)).toBe(false),
  )
  it('rejects empty string', () => {
    expect(isValidTag('')).toBe(false)
  })
  it('rejects tag with comma', () => {
    expect(isValidTag('foo,bar')).toBe(false)
  })
  it('rejects tag with pipe', () => {
    expect(isValidTag('foo|bar')).toBe(false)
  })
  it('rejects whitespace-only tag', () => {
    expect(isValidTag('  ')).toBe(false)
  })
  it('rejects a tag with a space or tab inside it', () => {
    expect(isValidTag('two words')).toBe(false)
    expect(isValidTag('a\tb')).toBe(false)
  })
  it('keeps the length limit in one place', () => {
    expect(MAX_TAG_LENGTH).toBe(16)
  })
})

describe('groupAmount', () => {
  it('returns "0" for empty string', () => {
    expect(groupAmount('')).toBe('0')
  })

  it('returns "0" for "0"', () => {
    expect(groupAmount('0')).toBe('0')
  })

  it('formats integer with thousand separators', () => {
    expect(groupAmount('1234')).toBe('1,234')
  })

  it('formats large integer with multiple separators', () => {
    expect(groupAmount('1234567')).toBe('1,234,567')
  })

  it('preserves trailing dot mid-input', () => {
    expect(groupAmount('1234.')).toBe('1,234.')
  })

  it('preserves single decimal digit', () => {
    expect(groupAmount('1234.5')).toBe('1,234.5')
  })

  it('preserves trailing zero in decimal', () => {
    expect(groupAmount('1234.50')).toBe('1,234.50')
  })

  it('formats decimals less than 1', () => {
    expect(groupAmount('0.05')).toBe('0.05')
  })

  it('handles "0." mid-input', () => {
    expect(groupAmount('0.')).toBe('0.')
  })
})

describe('heroAmountLabel', () => {
  it('puts refund plus before currency symbol', () => {
    expect(heroAmountLabel('123', true)).toBe('+ $123')
  })
})
