import { describe, it, expect } from 'vitest'
import { narrowChoices, type SheetChoice } from '../../modal/SlideUpSheet'

describe('narrowChoices', () => {
  const options: SheetChoice[] = [
    { key: 'food', label: 'Food' },
    { key: 'credit_card_payment', label: 'Credit card payment' },
    { key: 'hsbc-premier', label: 'HSBC Premier' },
  ]

  it('empty query returns all options', () => {
    expect(narrowChoices(options, '').map(option => option.key))
      .toEqual(['food', 'credit_card_payment', 'hsbc-premier'])
  })

  it('trims and matches labels case-insensitively', () => {
    expect(narrowChoices(options, '  hsbc  '))
      .toEqual([{ key: 'hsbc-premier', label: 'HSBC Premier' }])
  })

  it('matches option keys', () => {
    expect(narrowChoices(options, 'card').map(option => option.key))
      .toEqual(['credit_card_payment'])
  })

  it('returns empty array when nothing matches', () => {
    expect(narrowChoices(options, 'travel')).toEqual([])
  })
})
