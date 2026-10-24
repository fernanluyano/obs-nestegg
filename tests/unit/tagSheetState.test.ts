import { describe, it, expect } from 'vitest'
import { tagsMatching, toggleChosen, addPromptFor, withTag } from '../../modal/tagSheetState'

describe('tagsMatching', () => {
  const tags = ['Coffee_Shop', 'coffee', 'food', 'transport']

  it('lists every tag when nothing is typed', () => {
    expect(tagsMatching(tags, '')).toEqual(tags)
    expect(tagsMatching(tags, '   ')).toEqual(tags)
  })

  it('matches part of a name regardless of case', () => {
    expect(tagsMatching(tags, 'cof')).toEqual(['Coffee_Shop', 'coffee'])
    expect(tagsMatching(tags, 'FOO')).toEqual(['food'])
  })

  it('keeps the order it was given', () => {
    expect(tagsMatching(['zebra', 'apple', 'banana'], 'a')).toEqual(['zebra', 'apple', 'banana'])
  })

  it('finds nothing for text no tag contains', () => {
    expect(tagsMatching(tags, 'xyz')).toEqual([])
  })

  it('returns a copy when nothing is typed', () => {
    expect(tagsMatching(tags, '')).not.toBe(tags)
  })
})

describe('toggleChosen', () => {
  it('adds a tag that is not chosen yet', () => {
    expect(toggleChosen(new Set(['a']), 'b')).toEqual(new Set(['a', 'b']))
  })

  it('removes a tag that is already chosen', () => {
    expect(toggleChosen(new Set(['a', 'b']), 'a')).toEqual(new Set(['b']))
  })

  it('leaves the original set alone', () => {
    const before = new Set(['a'])
    toggleChosen(before, 'b')
    expect(before).toEqual(new Set(['a']))
  })
})

describe('addPromptFor', () => {
  it('has nothing to offer for blank text or a lone #', () => {
    for (const typed of ['', '   ', '#']) expect(addPromptFor(typed, [], 0)).toEqual({ kind: 'empty' })
  })

  it('offers to add a valid new name', () => {
    expect(addPromptFor('coffee', ['food'], 0)).toEqual({ kind: 'addable', name: 'coffee' })
  })

  it('trims, drops the # and lowercases before judging the name', () => {
    expect(addPromptFor('  #coffee  ', [], 0)).toEqual({ kind: 'addable', name: 'coffee' })
    expect(addPromptFor('Coffee', [], 0)).toEqual({ kind: 'addable', name: 'coffee' })
  })

  it('recognises a name that already exists, however it was typed', () => {
    for (const typed of ['coffee', '#coffee', 'COFFEE']) {
      expect(addPromptFor(typed, ['coffee'], 0)).toEqual({ kind: 'duplicate', name: 'coffee' })
    }
  })

  it('rejects characters a tag cannot hold', () => {
    for (const typed of ['a,b', 'a|b', 'two words', 'under_score']) {
      expect(addPromptFor(typed, [], 0)).toEqual({ kind: 'invalid', name: typed })
    }
    expect(addPromptFor('q3-2026', [], 0)).toEqual({ kind: 'addable', name: 'q3-2026' })
  })

  it('rejects names over 16 characters but accepts exactly 16', () => {
    expect(addPromptFor('abcdefghijklmnopq', [], 0)).toEqual({ kind: 'too-long', name: 'abcdefghijklmnopq' })
    expect(addPromptFor('abcdefghijklmnop', [], 0)).toEqual({ kind: 'addable', name: 'abcdefghijklmnop' })
  })

  it('reports a full selection only for a name that could otherwise be added', () => {
    expect(addPromptFor('coffee', [], 3)).toEqual({ kind: 'limit', name: 'coffee' })
    // An existing tag is reported as such: mentioning the limit there would only confuse.
    expect(addPromptFor('coffee', ['coffee'], 3)).toEqual({ kind: 'duplicate', name: 'coffee' })
  })
})

describe('withTag', () => {
  it('adds the tag and keeps the list sorted', () => {
    expect(withTag(['food', 'a'], 'coffee')).toEqual(['a', 'coffee', 'food'])
  })

  it('does not add a tag twice, and returns a copy', () => {
    const known = ['coffee']
    const next = withTag(known, 'coffee')
    expect(next).toEqual(['coffee'])
    expect(next).not.toBe(known)
  })
})
