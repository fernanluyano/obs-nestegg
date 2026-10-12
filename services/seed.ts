import { defaultCategories } from "../domain/defaults";
import { buildCategoryNote } from "../notes/categoryNote";
import { categoryPath } from "../notes/paths";
import type { Snapshot } from "../snapshot/snapshot";
import type { VaultPort } from "../storage/VaultPort";

// First run: a vault with no Nestegg notes at all gets the starter categories. The settings note
// is deliberately not created here: it appears when the first cash account is added, and its
// absence is what tells the plugin to show the setup wizard. Anything less than empty is left
// alone, so a user who deleted a category on purpose never has it come back.
export function isEmptyVault(snapshot: Snapshot): boolean {
	return (
		snapshot.settings === null &&
		snapshot.accounts.length === 0 &&
		snapshot.assets.length === 0 &&
		snapshot.categories.length === 0 &&
		snapshot.months.length === 0 &&
		snapshot.budgets.length === 0 &&
		snapshot.transit.length === 0 &&
		snapshot.invalid.length === 0
	);
}

export async function seedVault(port: VaultPort): Promise<void> {
	for (const category of defaultCategories()) await port.create(categoryPath(category.name), buildCategoryNote(category));
}
