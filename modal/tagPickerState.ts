import { normalizeTag } from '../domain/names'
import { TAG_MAX_LENGTH, validateTag } from '../utils'
import { TAG_LIMIT } from './transactionState'

export function filterTagsByQuery(tags: readonly string[], query: string): string[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...tags]
  return tags.filter(tag => tag.toLowerCase().includes(needle))
}

export function toggleStagedTag(staged: ReadonlySet<string>, tag: string): Set<string> {
  const next = new Set(staged)
  if (next.has(tag)) next.delete(tag)
  else next.add(tag)
  return next
}

export type AddRowState =
  | { kind: 'empty' }                       // search empty — row prompts to focus search
  | { kind: 'invalid'; name: string }       // search has chars but fails validateTag (e.g. ,|)
  | { kind: 'too-long'; name: string }      // exceeds the length cap
  | { kind: 'duplicate'; name: string }     // exact match against existing tag
  | { kind: 'limit'; name: string }         // would exceed the staged cap
  | { kind: 'addable'; name: string }       // ready to add

export function getAddRowState(
  query: string,
  existingTags: readonly string[],
  stagedCount: number,
): AddRowState {
  const normalized = normalizeTag(query)
  if (!normalized) return { kind: 'empty' }
  if ([...normalized].length > TAG_MAX_LENGTH) return { kind: 'too-long', name: normalized }
  if (!validateTag(normalized)) return { kind: 'invalid', name: normalized }
  if (existingTags.includes(normalized)) return { kind: 'duplicate', name: normalized }
  if (stagedCount >= TAG_LIMIT) return { kind: 'limit', name: normalized }
  return { kind: 'addable', name: normalized }
}

// A tag typed in the picker joins the list for the rest of the session; it is saved with the transaction.
export function withNewTag(known: readonly string[], tag: string): string[] {
  return known.includes(tag) ? [...known] : [...known, tag].sort()
}
