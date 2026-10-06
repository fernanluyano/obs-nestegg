import type { BulkProblem } from '../../domain/bulkEdit'
import type { LedgerEntry } from '../../domain/types'
import type { LabelKey } from '../../labels'

// A row has no id of its own, so its identity is its content plus how many identical rows came
// before it: two identical rows can be selected one at a time.
export function entryKeys(entries: LedgerEntry[]): string[] {
  const seen = new Map<string, number>()
  return entries.map(e => {
    const base = JSON.stringify([e.account, e.date, e.merchant, e.subcategory, e.amountCents, e.note, e.tags, e.fromTo])
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return `${base}#${n}`
  })
}

export function pickEntries(entries: LedgerEntry[], keys: string[], selected: ReadonlySet<string>): LedgerEntry[] {
  return entries.filter((_, i) => selected.has(keys[i]))
}

// Keys that still exist after the list was rebuilt, so a refresh does not leave ghosts selected.
export function pruneSelection(selected: ReadonlySet<string>, keys: string[]): Set<string> {
  const present = new Set(keys)
  return new Set([...selected].filter(k => present.has(k)))
}

export function toggleKey(selected: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(selected)
  if (!next.delete(key)) next.add(key)
  return next
}

// Selecting what is shown adds to the selection; when all of it is already selected, it clears
// just those, so the same button works both ways.
export function toggleAll(selected: ReadonlySet<string>, shownKeys: string[]): Set<string> {
  const allSelected = shownKeys.length > 0 && shownKeys.every(k => selected.has(k))
  const next = new Set(selected)
  for (const key of shownKeys) {
    if (allSelected) next.delete(key)
    else next.add(key)
  }
  return next
}

export const BULK_PROBLEM_LABELS: Record<Exclude<BulkProblem, 'empty' | 'badTarget'>, LabelKey> = {
  transfer: 'bulk.problem.transfer',
  unknown: 'bulk.problem.unknown',
  mixed: 'bulk.problem.mixed',
}
