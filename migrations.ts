import type { Account, Snapshot } from "./accounts";
import type { AccountType } from "./accountTypes";

// Bump whenever the persisted shape changes, and add a migration function
// here. Read once on load (main.ts's loadPluginData) to decide whether
// migration is needed at all — keep that check a single number comparison,
// not a per-record shape probe, so every load after the first migration
// stays cheap.
export const CURRENT_SCHEMA_VERSION = 3;

// The on-disk shape before v3: budget categories (and, by extension, the
// transactions concept they implied) may still be present from schema v1/v2.
export interface LegacyPluginDataV2 {
	accounts?: Account[];
	snapshots?: Snapshot[];
	assetTypes?: AccountType[];
	debtTypes?: AccountType[];
}

export interface MigratedPluginData {
	accounts: Account[];
	snapshots: Snapshot[];
	assetTypes: AccountType[];
	debtTypes: AccountType[];
}

// v1/v2 -> v3: this plugin only tracks wealth now — budget categories (and
// the transactions/recurring-expenses concept built on top of them) are
// dropped entirely, not carried forward. Everything else passes through.
export function migrateToV3(data: LegacyPluginDataV2): MigratedPluginData {
	return {
		accounts: data.accounts ?? [],
		snapshots: data.snapshots ?? [],
		assetTypes: data.assetTypes ?? [],
		debtTypes: data.debtTypes ?? [],
	};
}
