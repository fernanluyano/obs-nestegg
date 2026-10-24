import type { LabelKey } from "../labels";
import { activeAccounts } from "./queries";
import type { Snapshot } from "./snapshot";

export type Check = { ok: true } | { ok: false; reason: LabelKey; vars?: Record<string, string> };

export const activeCashAccounts = (snapshot: Snapshot) => activeAccounts(snapshot).filter((a) => a.accountType === "cash");

// The mandatory pieces of a usable vault: a cash account, categories that each hold at least one
// subcategory (Misc counts), and a cash account as the default.
export function cashAccountCheck(snapshot: Snapshot): Check {
	return activeCashAccounts(snapshot).length === 0 ? { ok: false, reason: "wizard.needCashAccount" } : { ok: true };
}

export function categoriesCheck(snapshot: Snapshot): Check {
	if (snapshot.categories.length === 0) return { ok: false, reason: "wizard.needCategory" };
	const empty = snapshot.categories.find((c) => c.category.subcategories.length === 0);
	if (empty) return { ok: false, reason: "wizard.emptyCategory", vars: { name: empty.category.name } };
	return { ok: true };
}

export function defaultAccountCheck(snapshot: Snapshot): Check {
	const wanted = snapshot.settings?.settings.defaultAccount;
	return activeCashAccounts(snapshot).some((a) => a.name === wanted) ? { ok: true } : { ok: false, reason: "wizard.needDefaultCash" };
}

// The settings note is created when the first cash account is added, so while it does not exist
// setup has not been done and the plugin opens the Accounts tab at the next start.
export function needsSetup(snapshot: Snapshot): boolean {
	return snapshot.settings === null;
}

// The last active cash account can't go away: it is the one account every user must have.
export function canRemoveAccount(snapshot: Snapshot, name: string): Check {
	const cash = activeCashAccounts(snapshot);
	if (cash.length === 1 && cash[0].name === name) return { ok: false, reason: "wizard.lastCashAccount" };
	return { ok: true };
}
