import { miscName } from "../domain/names";
import type { Snapshot } from "./snapshot";

export interface RenameImpact {
	files: number; // notes that get rewritten (and possibly moved)
	transactions: number; // transactions whose stored text changes or moves with its file
}

function subcategoryImpact(snapshot: Snapshot, subcategory: string, extraFiles: number): RenameImpact {
	let files = extraFiles;
	let transactions = 0;
	for (const month of snapshot.months) {
		const used = month.transactions.filter((tx) => tx.subcategory === subcategory).length;
		if (used === 0) continue;
		files++;
		transactions += used;
	}
	return { files, transactions };
}

// Moving transactions off removed subcategories rewrites the month files that hold them and the
// budgets that plan them; the category note changes by the removal itself, not by the move.
export function migrationImpact(snapshot: Snapshot, subcategories: string[]): RenameImpact {
	const impact = { files: 0, transactions: 0 };
	for (const month of snapshot.months) {
		const used = month.transactions.filter((tx) => subcategories.includes(tx.subcategory)).length;
		if (used === 0) continue;
		impact.files++;
		impact.transactions += used;
	}
	impact.files += snapshot.budgets.filter((b) => b.lines.some((l) => subcategories.includes(l.subcategory))).length;
	return impact;
}

// The category note itself is rewritten too, hence one extra file.
export function subcategoryRenameImpact(snapshot: Snapshot, subcategory: string): RenameImpact {
	return subcategoryImpact(snapshot, subcategory, 1);
}

// Renaming a category renames its Misc subcategory, so what changes is the Misc rows.
export function categoryRenameImpact(snapshot: Snapshot, category: string): RenameImpact {
	return subcategoryImpact(snapshot, miscName(category), 1);
}

// An account rename rewrites its note, every month file it owns (which move into the new folder),
// the FromTo cells of other accounts' transfers, and the settings note if it is the default.
export function accountRenameImpact(snapshot: Snapshot, account: string): RenameImpact {
	let files = 1;
	let transactions = 0;
	for (const month of snapshot.months) {
		if (month.account === account) {
			files++;
			transactions += month.transactions.length;
			continue;
		}
		const referencing = month.transactions.filter((tx) => tx.fromTo === account).length;
		if (referencing === 0) continue;
		files++;
		transactions += referencing;
	}
	if (snapshot.settings?.settings.defaultAccount === account) files++;
	return { files, transactions };
}
