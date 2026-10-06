import { subcategoryOptions, type CategoryIndex, type SubcategoryOption } from "./categories";
import type { Category, LedgerEntry } from "./types";

export type BulkProblem = "empty" | "transfer" | "unknown" | "mixed" | "badTarget";

export type BulkTargets = { ok: true; targets: SubcategoryOption[] } | { ok: false; problem: Exclude<BulkProblem, "badTarget"> };

// Rows can only be pointed at another subcategory of their own type, so their signs, the month
// totals and the budgets keep their meaning. Transfers have their own rules and are left alone.
export function bulkReassignTargets(entries: LedgerEntry[], categories: Category[], index: CategoryIndex): BulkTargets {
	if (entries.length === 0) return { ok: false, problem: "empty" };
	const types = new Set(entries.map((e) => index.typeOf(e.subcategory)));
	if (types.has(undefined)) return { ok: false, problem: "unknown" };
	if (types.has("transfer")) return { ok: false, problem: "transfer" };
	if (types.size > 1) return { ok: false, problem: "mixed" };
	const [type] = types;
	return { ok: true, targets: subcategoryOptions(categories, type) };
}

export function bulkReassignProblem(entries: LedgerEntry[], target: string, categories: Category[], index: CategoryIndex): BulkProblem | null {
	const result = bulkReassignTargets(entries, categories, index);
	if (!result.ok) return result.problem;
	return result.targets.some((o) => o.subcategory === target) ? null : "badTarget";
}
