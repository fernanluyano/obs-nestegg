import { describe, expect, it } from 'vitest'
import { bucketRowModel, parseAmountText, parseGoalText } from '../../modal/bucketState'

describe('parseAmountText', () => {
  it('parses dollars to cents from the digits', () => {
    expect(parseAmountText('12.34')).toEqual({ ok: true, cents: 1234 })
    expect(parseAmountText(' 1.15 ')).toEqual({ ok: true, cents: 115 })
    expect(parseAmountText('500')).toEqual({ ok: true, cents: 50000 })
  })

  it('asks for an amount, a valid one and a positive one', () => {
    expect(parseAmountText('  ')).toEqual({ ok: false, error: 'err.amountRequired' })
    expect(parseAmountText('1.234')).toEqual({ ok: false, error: 'err.amountInvalid' })
    expect(parseAmountText('abc')).toEqual({ ok: false, error: 'err.amountInvalid' })
    expect(parseAmountText('0')).toEqual({ ok: false, error: 'err.amountPositive' })
    expect(parseAmountText('-5')).toEqual({ ok: false, error: 'err.amountPositive' })
  })
})

describe('parseGoalText', () => {
  it('reads blank as no goal', () => {
    expect(parseGoalText('')).toEqual({ ok: true, goalCents: undefined })
    expect(parseGoalText('   ')).toEqual({ ok: true, goalCents: undefined })
  })

  it('reads a positive amount as the goal and passes on amount errors', () => {
    expect(parseGoalText('10000')).toEqual({ ok: true, goalCents: 1000000 })
    expect(parseGoalText('0')).toEqual({ ok: false, error: 'err.amountPositive' })
    expect(parseGoalText('x')).toEqual({ ok: false, error: 'err.amountInvalid' })
  })
})

describe('bucketRowModel', () => {
  it('shows progress against a goal in whole percent, capped at complete', () => {
    expect(bucketRowModel({ name: 'Fund', goalCents: 1000000, balanceCents: 250000 })).toEqual({
      name: 'Fund', balanceText: '2,500.00', goalText: '10,000.00', percent: 25,
    })
    expect(bucketRowModel({ name: 'Fund', goalCents: 1000, balanceCents: 333 }).percent).toBe(33)
    expect(bucketRowModel({ name: 'Fund', goalCents: 1000, balanceCents: 5000 }).percent).toBe(100)
  })

  it('has no goal text or progress without a goal', () => {
    expect(bucketRowModel({ name: 'Trip', balanceCents: 40000 })).toEqual({
      name: 'Trip', balanceText: '400.00', goalText: null, percent: null,
    })
  })
})
