import { normalizeTag } from '../domain/names'
import { MAX_TAG_LENGTH, isValidTag } from '../helpers'
import { TAG_LIMIT } from './entryDraft'

// The tags whose name contains what was typed, in the order they were given.
export function tagsMatching(tags: readonly string[], typed: string): string[] {
  const needle = typed.trim().toLowerCase()
  return needle === '' ? [...tags] : tags.filter(tag => tag.toLowerCase().includes(needle))
}

// A new set with the tag added, or removed when it was already in.
export function toggleChosen(chosen: ReadonlySet<string>, tag: string): Set<string> {
  const next = new Set(chosen)
  if (!next.delete(tag)) next.add(tag)
  return next
}

// What the "add" control under the search box should offer for the text typed so far.
export type AddPrompt =
  | { kind: 'empty' }                       // nothing usable typed: the control just invites typing
  | { kind: 'invalid'; name: string }       // has characters a tag cannot contain (e.g. ,|)
  | { kind: 'too-long'; name: string }      // longer than a tag may be
  | { kind: 'duplicate'; name: string }     // already one of the known tags
  | { kind: 'limit'; name: string }         // the selection is already full
  | { kind: 'addable'; name: string }       // can be added right now

export function addPromptFor(typed: string, knownTags: readonly string[], chosenCount: number): AddPrompt {
  const name = normalizeTag(typed)
  if (!name) return { kind: 'empty' }
  if ([...name].length > MAX_TAG_LENGTH) return { kind: 'too-long', name }
  if (!isValidTag(name)) return { kind: 'invalid', name }
  if (knownTags.includes(name)) return { kind: 'duplicate', name }
  if (chosenCount >= TAG_LIMIT) return { kind: 'limit', name }
  return { kind: 'addable', name }
}

// A tag typed in the sheet joins the known list for the rest of the session; it is saved with the transaction.
export function withTag(knownTags: readonly string[], tag: string): string[] {
  return knownTags.includes(tag) ? [...knownTags] : [...knownTags, tag].sort()
}
