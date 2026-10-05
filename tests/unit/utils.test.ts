import { describe, it, expect, vi, afterEach } from 'vitest'
import { stepMonth, isAfterCurrentMonth, validateTag, formatHeroAmount, formatMobileHeroAmount, dateToYearMonth, dateToMonthDay } from '../../utils'

// ── stepMonth ─────────────────────────────────────────────────────────────────

describe('stepMonth', () => {
  it('advances one month', () => {
    expect(stepMonth('2026-01', 1)).toBe('2026-02')
  })

  it('rolls over year boundary forward', () => {
    expect(stepMonth('2026-12', 1)).toBe('2027-01')
  })

  it('rolls back year boundary backward', () => {
    expect(stepMonth('2026-01', -1)).toBe('2025-12')
  })

  it('advances multiple months', () => {
    expect(stepMonth('2026-01', 3)).toBe('2026-04')
  })

  it('delta 0 returns same month', () => {
    expect(stepMonth('2026-06', 0)).toBe('2026-06')
  })
})

// ── isAfterCurrentMonth ───────────────────────────────────────────────────────

describe('isAfterCurrentMonth', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true for a future month', () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026)
    vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(2) // March (0-indexed)
    expect(isAfterCurrentMonth('2026-04')).toBe(true)
  })

  it('returns false for the current month', () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026)
    vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(2) // March
    expect(isAfterCurrentMonth('2026-03')).toBe(false)
  })

  it('returns false for a past month', () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026)
    vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(2) // March
    expect(isAfterCurrentMonth('2025-12')).toBe(false)
  })
})


// ── dateToYearMonth / dateToMonthDay ──────────────────────────────────────────

describe('currentYearMonth', () => {
  it('returns a string in YYYY-MM format', async () => {
    const { currentYearMonth } = await import('../../utils')
    expect(currentYearMonth()).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('dateToYearMonth', () => {
  it('extracts yyyy-mm from a full date string', () => {
    expect(dateToYearMonth('2026-04-03')).toBe('2026-04')
  })

  it('works for december', () => {
    expect(dateToYearMonth('2025-12-31')).toBe('2025-12')
  })
})

describe('dateToMonthDay', () => {
  it('extracts MM/DD from a full date string', () => {
    expect(dateToMonthDay('2026-04-03')).toBe('04/03')
  })

  it('works for single-digit month and day', () => {
    expect(dateToMonthDay('2026-01-09')).toBe('01/09')
  })
})

// ── validateTag ───────────────────────────────────────────────────────────────

describe('validateTag', () => {
  it('accepts short ASCII tag', () => {
    expect(validateTag('food')).toBe(true)
  })
  it('accepts 10-char ASCII tag', () => {
    expect(validateTag('abcdefghij')).toBe(true)
  })
  it('rejects 11-char ASCII tag', () => {
    expect(validateTag('abcdefghijk')).toBe(false)
  })
  it('rejects empty string', () => {
    expect(validateTag('')).toBe(false)
  })
  it('rejects tag with comma', () => {
    expect(validateTag('foo,bar')).toBe(false)
  })
  it('rejects tag with pipe', () => {
    expect(validateTag('foo|bar')).toBe(false)
  })
  it('rejects whitespace-only tag', () => {
    expect(validateTag('  ')).toBe(false)
  })
})

describe('formatHeroAmount', () => {
  it('returns "0" for empty string', () => {
    expect(formatHeroAmount('')).toBe('0')
  })

  it('returns "0" for "0"', () => {
    expect(formatHeroAmount('0')).toBe('0')
  })

  it('formats integer with thousand separators', () => {
    expect(formatHeroAmount('1234')).toBe('1,234')
  })

  it('formats large integer with multiple separators', () => {
    expect(formatHeroAmount('1234567')).toBe('1,234,567')
  })

  it('preserves trailing dot mid-input', () => {
    expect(formatHeroAmount('1234.')).toBe('1,234.')
  })

  it('preserves single decimal digit', () => {
    expect(formatHeroAmount('1234.5')).toBe('1,234.5')
  })

  it('preserves trailing zero in decimal', () => {
    expect(formatHeroAmount('1234.50')).toBe('1,234.50')
  })

  it('formats decimals less than 1', () => {
    expect(formatHeroAmount('0.05')).toBe('0.05')
  })

  it('handles "0." mid-input', () => {
    expect(formatHeroAmount('0.')).toBe('0.')
  })
})

describe('formatMobileHeroAmount', () => {
  it('puts refund plus before currency symbol', () => {
    expect(formatMobileHeroAmount('123', true)).toBe('+ $123')
  })
})
