import { describe, it, expect } from 'vitest'
import { filterTagsByQuery, toggleStagedTag, getAddRowState, withNewTag } from '../../modal/tagPickerState'

describe('filterTagsByQuery', () => {
  const tags = ['Coffee_Shop', 'coffee', 'food', 'transport']

  it('returns all tags for empty query', () => {
    expect(filterTagsByQuery(tags, '')).toEqual(tags)
  })

  it('case-insensitive substring match', () => {
    expect(filterTagsByQuery(tags, 'cof')).toEqual(['Coffee_Shop', 'coffee'])
  })

  it('preserves caller-supplied order (no re-sort inside filter)', () => {
    expect(filterTagsByQuery(['zebra', 'apple', 'banana'], 'a'))
      .toEqual(['zebra', 'apple', 'banana'])
  })

  it('returns empty for no match', () => {
    expect(filterTagsByQuery(tags, 'xyz')).toEqual([])
  })
})

describe('toggleStagedTag', () => {
  it('adds tag if not present', () => {
    expect(toggleStagedTag(new Set(['a']), 'b')).toEqual(new Set(['a', 'b']))
  })

  it('removes tag if present', () => {
    expect(toggleStagedTag(new Set(['a', 'b']), 'a')).toEqual(new Set(['b']))
  })

  it('does not mutate input', () => {
    const original = new Set(['a'])
    toggleStagedTag(original, 'b')
    expect(original).toEqual(new Set(['a']))
  })
})

describe('getAddRowState', () => {
  it('returns empty when query has no usable chars', () => {
    expect(getAddRowState('', [], 0)).toEqual({ kind: 'empty' })
    expect(getAddRowState('   ', [], 0)).toEqual({ kind: 'empty' })
    expect(getAddRowState('#', [], 0)).toEqual({ kind: 'empty' })
  })

  it('returns addable for valid unique name below limit', () => {
    expect(getAddRowState('coffee', ['food'], 0))
      .toEqual({ kind: 'addable', name: 'coffee' })
  })

  it('trims and strips # before classifying', () => {
    expect(getAddRowState('  #coffee  ', [], 0))
      .toEqual({ kind: 'addable', name: 'coffee' })
  })

  it('lowercases the name, so a differently cased query matches the existing tag', () => {
    expect(getAddRowState('Coffee', [], 0)).toEqual({ kind: 'addable', name: 'coffee' })
    expect(getAddRowState('COFFEE', ['coffee'], 0)).toEqual({ kind: 'duplicate', name: 'coffee' })
  })

  it('returns duplicate when query matches an existing tag', () => {
    expect(getAddRowState('coffee', ['coffee'], 0))
      .toEqual({ kind: 'duplicate', name: 'coffee' })
    expect(getAddRowState('#coffee', ['coffee'], 0))
      .toEqual({ kind: 'duplicate', name: 'coffee' })
  })

  it('returns invalid when validateTag rejects the name', () => {
    expect(getAddRowState('a,b', [], 0))
      .toEqual({ kind: 'invalid', name: 'a,b' })
    expect(getAddRowState('a|b', [], 0))
      .toEqual({ kind: 'invalid', name: 'a|b' })
  })

  it('returns invalid for a name with a space inside it', () => {
    expect(getAddRowState('two words', [], 0)).toEqual({ kind: 'invalid', name: 'two words' })
  })

  it('returns too-long when length exceeds 16', () => {
    expect(getAddRowState('abcdefghijklmnopq', [], 0))
      .toEqual({ kind: 'too-long', name: 'abcdefghijklmnopq' })
    // boundary: exactly at cap is still addable
    expect(getAddRowState('abcdefghijklmnop', [], 0))
      .toEqual({ kind: 'addable', name: 'abcdefghijklmnop' })
  })

  it('returns invalid for an underscore or other symbol', () => {
    expect(getAddRowState('under_score', [], 0)).toEqual({ kind: 'invalid', name: 'under_score' })
    expect(getAddRowState('q3-2026', [], 0)).toEqual({ kind: 'addable', name: 'q3-2026' })
  })

  it('returns limit when staged count is already at the cap', () => {
    expect(getAddRowState('coffee', [], 3))
      .toEqual({ kind: 'limit', name: 'coffee' })
  })

  it('limit takes precedence after duplicate/invalid checks', () => {
    // duplicate beats limit — user already has the tag, telling them
    // about the limit would be confusing.
    expect(getAddRowState('coffee', ['coffee'], 3))
      .toEqual({ kind: 'duplicate', name: 'coffee' })
  })
})

describe('withNewTag', () => {
  it('adds the tag and keeps the list sorted', () => {
    expect(withNewTag(['food', 'a'], 'coffee')).toEqual(['a', 'coffee', 'food'])
  })

  it('does not add a tag twice, and returns a copy', () => {
    const known = ['coffee']
    const next = withNewTag(known, 'coffee')
    expect(next).toEqual(['coffee'])
    expect(next).not.toBe(known)
  })
})
