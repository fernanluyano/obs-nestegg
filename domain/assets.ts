import { isIsoDate } from "./dates";
import { nameProblem, type NameProblem } from "./names";

export type AssetType = "house" | "vehicle" | "metal" | "other";

// Fixed on purpose: a new type is added here, in code.
export const ASSET_TYPES: readonly AssetType[] = ["house", "vehicle", "metal", "other"];

// Something owned and valued by hand. It is not an account: no transactions, no balance checkpoint.
export interface Asset {
	name: string;
	assetType: AssetType;
	active: boolean; // false = archived: kept in the vault, shown nowhere
	color: string; // #rrggbb
}

// One dated row of an asset's history.
export interface Valuation {
	date: string; // YYYY-MM-DD
	valueCents: number; // zero or more
	note: string;
}

export type ValuationProblem = "invalidDate" | "invalidValue";

export function valuationProblem(valuation: Pick<Valuation, "date" | "valueCents">): ValuationProblem | null {
	if (!isIsoDate(valuation.date)) return "invalidDate";
	if (!Number.isSafeInteger(valuation.valueCents) || valuation.valueCents < 0) return "invalidValue";
	return null;
}

export function sortValuations(valuations: Valuation[]): Valuation[] {
	return [...valuations].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// The most recent valuation, wherever it sits in the list; null for an asset with no rows.
export function latestValuation(valuations: Valuation[]): Valuation | null {
	let latest: Valuation | null = null;
	for (const v of valuations) if (latest === null || v.date > latest.date) latest = v;
	return latest;
}

// The value on `date`: the latest row dated on or before it. Before the first row the asset is not
// owned yet, so it counts as zero.
export function valueAt(valuations: Valuation[], date: string): number {
	let best: Valuation | null = null;
	for (const v of valuations) if (v.date <= date && (best === null || v.date > best.date)) best = v;
	return best?.valueCents ?? 0;
}

export function assetNameProblem(assets: Asset[], name: string, renaming?: string): NameProblem | "duplicate" | null {
	const problem = nameProblem(name);
	if (problem) return problem;
	return assets.some((a) => a.name === name && a.name !== renaming) ? "duplicate" : null;
}
