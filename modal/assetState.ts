import { assetNameProblem, type Asset } from '../domain/assets'
import { isIsoDate } from '../domain/dates'
import { parseCents } from '../domain/money'
import type { LabelKey } from '../labels'

export type ValueParse = { ok: true; cents: number } | { ok: false; error: LabelKey }
export type ValuationFormParse = { ok: true; valueCents: number; date: string } | { ok: false; error: LabelKey }
export type NewAssetFormParse = { ok: true; name: string; valueCents: number; date: string } | { ok: false; error: LabelKey }

// A typed dollar value: zero or more, at most two decimals.
export function parseValueText(text: string): ValueParse {
  if (text.trim() === '') return { ok: false, error: 'err.amountRequired' }
  const cents = parseCents(text)
  if (cents === null) return { ok: false, error: 'err.amountInvalid' }
  if (cents < 0) return { ok: false, error: 'err.assetValueNegative' }
  return { ok: true, cents }
}

export function parseValuationForm(form: { valueText: string; date: string }): ValuationFormParse {
  if (!isIsoDate(form.date)) return { ok: false, error: 'err.invalidDate' }
  const value = parseValueText(form.valueText)
  return value.ok ? { ok: true, valueCents: value.cents, date: form.date } : value
}

// The edit form keeps the asset's own name valid, so saving without touching the name is fine.
export function parseAssetEditForm(form: { name: string }, existing: Asset[], current: string): { ok: true; name: string } | { ok: false; error: LabelKey } {
  const problem = assetNameProblem(existing, form.name, current)
  if (problem === 'empty') return { ok: false, error: 'err.assetNameEmpty' }
  if (problem === 'invalid') return { ok: false, error: 'err.invalidName' }
  if (problem === 'duplicate') return { ok: false, error: 'err.assetNameTaken' }
  return { ok: true, name: form.name }
}

export function parseNewAssetForm(form: { name: string; valueText: string; date: string }, existing: Asset[]): NewAssetFormParse {
  const problem = assetNameProblem(existing, form.name)
  if (problem === 'empty') return { ok: false, error: 'err.assetNameEmpty' }
  if (problem === 'invalid') return { ok: false, error: 'err.invalidName' }
  if (problem === 'duplicate') return { ok: false, error: 'err.assetNameTaken' }
  const valuation = parseValuationForm(form)
  return valuation.ok ? { ...valuation, name: form.name } : valuation
}
