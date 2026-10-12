import { ASSET_TYPES, latestValuation, valueAt, type AssetType } from "../domain/assets";
import { monthEndKey, monthOf } from "../domain/dates";
import type { AssetRecord, Snapshot } from "./snapshot";

// Archived assets are shown nowhere, so every read the UI makes goes through the active ones.
export function activeAssets(snapshot: Snapshot): AssetRecord[] {
	return snapshot.assets.filter((record) => record.asset.active);
}

export function findAsset(snapshot: Snapshot, name: string): AssetRecord | undefined {
	return snapshot.assets.find((record) => record.asset.name === name);
}

// What the active assets are worth now (each one's latest valuation), summed per type in the
// fixed type order. A type with nothing in it is left out.
export function assetsByType(snapshot: Snapshot): Map<AssetType, number> {
	const totals = new Map<AssetType, number>();
	for (const type of ASSET_TYPES) {
		const cents = activeAssets(snapshot)
			.filter((record) => record.asset.assetType === type)
			.reduce((sum, record) => sum + (latestValuation(record.valuations)?.valueCents ?? 0), 0);
		if (cents > 0) totals.set(type, cents);
	}
	return totals;
}

// The months from the earliest valuation of any active asset on, so a graph does not reach back to
// times nothing was entered. Nothing was ever entered: no months at all.
export function monthsFromFirstEntry(snapshot: Snapshot, months: string[]): string[] {
	const dates = activeAssets(snapshot).flatMap((record) => record.valuations.map((v) => v.date));
	if (dates.length === 0) return [];
	const first = monthOf(dates.reduce((min, d) => (d < min ? d : min)));
	return months.filter((month) => month >= first);
}

// The total value of the active assets at the end of each month. Assets only: no account or debt
// is counted, so this is not a net worth.
export function assetsTimeline(snapshot: Snapshot, months: string[]): Map<string, number> {
	const counted = activeAssets(snapshot);
	return new Map(
		months.map((month) => [month, counted.reduce((sum, record) => sum + valueAt(record.valuations, monthEndKey(month)), 0)]),
	);
}
