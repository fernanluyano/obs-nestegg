import { bucketProgress, type Bucket } from '../domain/buckets'
import { formatCents, parseCents } from '../domain/money'
import type { LabelKey } from '../labels'

export type AmountParse = { ok: true; cents: number } | { ok: false; error: LabelKey }
export type GoalParse = { ok: true; goalCents: number | undefined } | { ok: false; error: LabelKey }

// A typed dollar amount moved into or out of a bucket: more than zero, at most two decimals.
export function parseAmountText(text: string): AmountParse {
  if (text.trim() === '') return { ok: false, error: 'err.amountRequired' }
  const cents = parseCents(text)
  if (cents === null) return { ok: false, error: 'err.amountInvalid' }
  if (cents <= 0) return { ok: false, error: 'err.amountPositive' }
  return { ok: true, cents }
}

// Blank means no goal.
export function parseGoalText(text: string): GoalParse {
  if (text.trim() === '') return { ok: true, goalCents: undefined }
  const parsed = parseAmountText(text)
  return parsed.ok ? { ok: true, goalCents: parsed.cents } : parsed
}

export interface BucketRowModel {
  name: string
  balanceText: string
  goalText: string | null // null without a goal
  percent: number | null // whole percent of the goal, capped at 100; null without a goal
}

export function bucketRowModel(bucket: Bucket): BucketRowModel {
  const progress = bucketProgress(bucket)
  return {
    name: bucket.name,
    balanceText: formatCents(bucket.balanceCents),
    goalText: bucket.goalCents === undefined ? null : formatCents(bucket.goalCents),
    percent: progress === null ? null : Math.floor(progress * 100),
  }
}
