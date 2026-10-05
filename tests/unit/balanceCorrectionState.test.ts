import { describe, expect, it } from 'vitest'
import { correctionPatch, parseCorrectionForm, previewCorrection, type ParsedCorrection } from '../../modal/balanceCorrectionState'
import { account, tx } from '../helpers/fixtures'

const form = (over = {}) => ({ balance: '1000.00', asOf: '2026-10-02', knownToday: '', ...over })

describe('parseCorrectionForm', () => {
  it('parses the balance to cents and leaves the optional known balance empty', () => {
    expect(parseCorrectionForm(form())).toEqual({ ok: true, value: { balanceCents: 100000, asOf: '2026-10-02', knownTodayCents: null } })
  })

  it('parses the known balance when given', () => {
    expect(parseCorrectionForm(form({ knownToday: '950.5' }))).toMatchObject({ ok: true, value: { knownTodayCents: 95050 } })
  })

  it('rejects a blank, malformed or negative balance', () => {
    expect(parseCorrectionForm(form({ balance: ' ' }))).toEqual({ ok: false, reason: 'err.balanceRequired' })
    expect(parseCorrectionForm(form({ balance: 'abc' }))).toEqual({ ok: false, reason: 'err.amountInvalid' })
    expect(parseCorrectionForm(form({ balance: '-5' }))).toEqual({ ok: false, reason: 'err.balanceNegative' })
  })

  it('rejects a bad date', () => {
    expect(parseCorrectionForm(form({ asOf: '10/02' }))).toEqual({ ok: false, reason: 'err.invalidDate' })
    expect(parseCorrectionForm(form({ asOf: '' }))).toEqual({ ok: false, reason: 'err.invalidDate' })
  })

  it('rejects a malformed or negative known balance', () => {
    expect(parseCorrectionForm(form({ knownToday: 'x' }))).toEqual({ ok: false, reason: 'err.amountInvalid' })
    expect(parseCorrectionForm(form({ knownToday: '-1' }))).toEqual({ ok: false, reason: 'err.balanceNegative' })
  })
})

describe('correctionPatch', () => {
  const rows = [tx({ date: '2026-10-03', amountCents: -300 })]
  const parsed = (knownTodayCents: number | null): ParsedCorrection =>
    ({ balanceCents: 100000, asOf: '2026-10-02', knownTodayCents })
  const patch = (known: number | null) => {
    const input = parsed(known)
    return correctionPatch(input, previewCorrection(account(), rows, input, '2026-10-31'))
  }

  it('carries the entered balance and date', () => {
    expect(patch(null)).toMatchObject({ enteredBalanceCents: 100000, enteredBalanceAsOf: '2026-10-02' })
  })

  it('marks the account unbalanced by the signed difference when the known balance disagrees', () => {
    expect(patch(99000).unbalancedCents).toBe(700)
  })

  it('clears the mark when the known balance matches or was not given', () => {
    expect(patch(99700).unbalancedCents).toBeUndefined()
    expect(patch(null).unbalancedCents).toBeUndefined()
    expect(patch(null)).toHaveProperty('unbalancedCents')
  })
})

describe('previewCorrection', () => {
  const rows = [
    tx({ date: '2026-09-28', amountCents: -1000 }),
    tx({ date: '2026-10-02', amountCents: -500 }),
    tx({ date: '2026-10-03', amountCents: -300 }),
    tx({ date: '2026-10-10', amountCents: 700 }),
  ]
  const input = (over: Partial<ParsedCorrection> = {}): ParsedCorrection =>
    ({ balanceCents: 100000, asOf: '2026-10-02', knownTodayCents: null, ...over })

  it('projects the current balance from the entered one plus the rows after its date, without saving', () => {
    const acct = account({ balanceCents: 123 })
    const preview = previewCorrection(acct, rows, input(), '2026-10-31')
    expect(preview).toMatchObject({ previousCents: 123, projectedCents: 100000 - 300 + 700, rowsAfter: 2, netAfterCents: 400, rowsCovered: 2 })
    expect(acct.enteredBalanceCents).toBe(200000)
  })

  it('counts a row dated exactly on the date as already covered', () => {
    const preview = previewCorrection(account(), rows, input({ asOf: '2026-10-03' }), '2026-10-31')
    expect(preview).toMatchObject({ rowsAfter: 1, rowsCovered: 3 })
  })

  it('flips the direction for credit cards', () => {
    const card = account({ accountType: 'creditCard' })
    expect(previewCorrection(card, rows, input({ balanceCents: 5000 }), '2026-10-31').projectedCents).toBe(5000 - 400)
  })

  it('warns when a past date has later rows, not when the date is today or nothing follows', () => {
    expect(previewCorrection(account(), rows, input(), '2026-10-31').warnPastDate).toBe(true)
    expect(previewCorrection(account(), rows, input({ asOf: '2026-10-10' }), '2026-10-10').warnPastDate).toBe(false)
    expect(previewCorrection(account(), rows, input({ asOf: '2026-10-10' }), '2026-10-31').warnPastDate).toBe(false)
    expect(previewCorrection(account(), [], input(), '2026-10-31').warnPastDate).toBe(false)
  })

  it('has no check without a known balance', () => {
    expect(previewCorrection(account(), rows, input(), '2026-10-31').check).toBeNull()
  })

  it('matches when the projected balance equals the known one', () => {
    const preview = previewCorrection(account(), rows, input({ knownTodayCents: 100400 }), '2026-10-31')
    expect(preview.check).toEqual({ status: 'match' })
  })

  it('reports the signed difference (projected minus known) on a mismatch', () => {
    const preview = previewCorrection(account(), rows, input({ knownTodayCents: 100000 }), '2026-10-31')
    expect(preview.check).toEqual({ status: 'mismatch', diffCents: 400 })
  })
})
