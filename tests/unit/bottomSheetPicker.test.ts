import { describe, it, expect } from 'vitest'
import { filterBottomSheetOptions, type BottomSheetOption } from '../../modal/BottomSheetPicker'

describe('filterBottomSheetOptions', () => {
  const options: BottomSheetOption[] = [
    { key: 'food', label: 'Food' },
    { key: 'credit_card_payment', label: 'Credit card payment' },
    { key: 'hsbc-premier', label: 'HSBC Premier' },
  ]

  it('empty query returns all options', () => {
    expect(filterBottomSheetOptions(options, '').map(option => option.key))
      .toEqual(['food', 'credit_card_payment', 'hsbc-premier'])
  })

  it('trims and matches labels case-insensitively', () => {
    expect(filterBottomSheetOptions(options, '  hsbc  '))
      .toEqual([{ key: 'hsbc-premier', label: 'HSBC Premier' }])
  })

  it('matches option keys', () => {
    expect(filterBottomSheetOptions(options, 'card').map(option => option.key))
      .toEqual(['credit_card_payment'])
  })

  it('returns empty array when nothing matches', () => {
    expect(filterBottomSheetOptions(options, 'travel')).toEqual([])
  })
})
