import { accountPath, budgetPath, categoryPath, monthPath, SETTINGS_PATH } from "../notes/paths";
import type { Snapshot } from "../snapshot/snapshot";
import type { InTransitIssue, InvalidNoteIssue, PathMismatchIssue } from "./issues";

// Properties win over paths, so a moved or renamed file is a warning, never a data error.
export function detectPathMismatches(snapshot: Snapshot): PathMismatchIssue[] {
	const issues: PathMismatchIssue[] = [];
	const check = (kind: PathMismatchIssue["kind"], path: string, expectedPath: string) => {
		if (path !== expectedPath) issues.push({ type: "pathMismatch", kind, path, expectedPath });
	};
	if (snapshot.settings) check("settings", snapshot.settings.path, SETTINGS_PATH);
	for (const a of snapshot.accounts) check("account", a.path, accountPath(a.account.name));
	for (const c of snapshot.categories) check("category", c.path, categoryPath(c.category.name));
	for (const m of snapshot.months) check("transactions", m.path, monthPath(m.account, m.month));
	for (const b of snapshot.budgets) check("budget", b.path, budgetPath(b.month));
	return issues;
}

export function detectInTransit(snapshot: Snapshot): InTransitIssue[] {
	return snapshot.transit.map((t) => ({ type: "inTransit", kind: t.kind, path: t.path, transitFor: t.transitFor }));
}

export function detectInvalidNotes(snapshot: Snapshot): InvalidNoteIssue[] {
	return snapshot.invalid.map((n) => ({ type: "invalidNote", kind: n.kind, path: n.path, reason: n.reason }));
}
