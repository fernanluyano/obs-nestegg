import { categoryIndexOf, type Snapshot } from "../snapshot/snapshot";
import {
	detectDuplicateAccounts, detectInvalidDefaultAccount, detectNegativeAvailable, detectOrphanedAccounts,
	detectStaleAvailable, detectStaleBalances,
} from "./accountIssues";
import {
	detectDuplicateCategories, detectDuplicateSubcategories, detectUnknownSubcategories,
} from "./categoryIssues";
import type { ValidationIssue } from "./issues";
import { detectDuplicateMonths, detectMalformedRows, detectMonthTotals } from "./monthIssues";
import { detectInTransit, detectInvalidNotes, detectPathMismatches } from "./noteIssues";
import { detectTransferIssues } from "./transferIssues";

export function validateSnapshot(snapshot: Snapshot): ValidationIssue[] {
	const index = categoryIndexOf(snapshot);
	return [
		...detectInTransit(snapshot),
		...detectInvalidNotes(snapshot),
		...detectMalformedRows(snapshot),
		...detectDuplicateAccounts(snapshot),
		...detectDuplicateCategories(snapshot),
		...detectDuplicateSubcategories(snapshot),
		...detectDuplicateMonths(snapshot),
		...detectOrphanedAccounts(snapshot),
		...detectUnknownSubcategories(snapshot),
		...detectTransferIssues(snapshot),
		...detectMonthTotals(snapshot, index),
		...detectStaleBalances(snapshot),
		...detectStaleAvailable(snapshot),
		...detectNegativeAvailable(snapshot),
		...detectInvalidDefaultAccount(snapshot),
		...detectPathMismatches(snapshot),
	];
}
