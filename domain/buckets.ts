import { nameProblem, type NameProblem } from "./names";
import type { Account } from "./types";

// A set-aside inside one cash account. It never changes the account's balance, only how much of
// it is still available to spend.
export interface Bucket {
	name: string;
	goalCents?: number; // absent means no goal
	balanceCents: number;
}

export type BucketProblem =
	| "invalidAmount"
	| "amountNotPositive"
	| "invalidGoal"
	| "exceedsAvailable"
	| "exceedsBucket"
	| "unknownBucket";

export const bucketsTotal = (buckets: Bucket[]): number => buckets.reduce((sum, b) => sum + b.balanceCents, 0);

export const availableOf = (balanceCents: number, buckets: Bucket[]): number => balanceCents - bucketsTotal(buckets);

// An account note without the cached property reads as having nothing set aside.
export const cachedAvailable = (account: Pick<Account, "balanceCents" | "availableCents">): number => account.availableCents ?? account.balanceCents;

// Share of the goal reached, 0 to 1; a balance past the goal just reads as complete. Null without a goal.
export function bucketProgress(bucket: Bucket): number | null {
	if (bucket.goalCents === undefined) return null;
	return Math.min(1, Math.max(0, bucket.balanceCents) / bucket.goalCents);
}

export function bucketNameProblem(buckets: Bucket[], name: string, renaming?: string): NameProblem | "duplicate" | null {
	const problem = nameProblem(name);
	if (problem) return problem;
	return buckets.some((b) => b.name === name && b.name !== renaming) ? "duplicate" : null;
}

export function goalProblem(goalCents: number | undefined): "invalidGoal" | null {
	if (goalCents === undefined) return null;
	return Number.isSafeInteger(goalCents) && goalCents >= 1 ? null : "invalidGoal";
}

function amountProblem(cents: number): "invalidAmount" | "amountNotPositive" | null {
	if (!Number.isSafeInteger(cents)) return "invalidAmount";
	return cents <= 0 ? "amountNotPositive" : null;
}

// Money goes into a bucket from what is available, never from another bucket.
export function moveInProblem(cents: number, availableCents: number): BucketProblem | null {
	return amountProblem(cents) ?? (cents > availableCents ? "exceedsAvailable" : null);
}

export function moveOutProblem(cents: number, bucket: Bucket): BucketProblem | null {
	return amountProblem(cents) ?? (cents > bucket.balanceCents ? "exceedsBucket" : null);
}

export type OutflowProblem =
	| { kind: "notEnoughFunds" }
	| { kind: "bucketsHold"; availableCents: number; needsCents: number; bucketsCents: number };

// The check for a new entry that lowers a cash account's balance by `outflowCents` (positive).
// Available may not end up below zero; when the balance alone would still cover it, the money is
// sitting in buckets and the user is told to move it out.
export function outflowProblem(balanceCents: number, buckets: Bucket[], outflowCents: number): OutflowProblem | null {
	if (outflowCents <= 0) return null;
	const bucketsCents = bucketsTotal(buckets);
	if (balanceCents - outflowCents - bucketsCents >= 0) return null;
	if (balanceCents - outflowCents < 0) return { kind: "notEnoughFunds" };
	return { kind: "bucketsHold", availableCents: balanceCents - bucketsCents, needsCents: outflowCents, bucketsCents };
}
