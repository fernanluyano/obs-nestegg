import { parseProps } from "../notes/frontmatter";
import { markCurrent, markInTransit } from "../notes/transit";
import { transitPath } from "../notes/paths";
import { buildSnapshot, type NoteInput } from "../snapshot/snapshot";
import { cleanupEmptyFolders } from "../storage/folders";
import { loadInputs } from "../storage/loader";
import type { VaultPort } from "../storage/VaultPort";
import type { ValidationIssue } from "../validation/issues";
import { validateSnapshot } from "../validation/validate";
import { RenameError, type FileChange, type RenamePlan } from "./types";

export class RenameValidationError extends RenameError {
	constructor(readonly issues: ValidationIssue[]) {
		super(`The rename would leave the data inconsistent (${issues.map((i) => i.type).join(", ")})`);
	}
}

// A rename never changes amounts, so totals and balances can't be affected by it, and moved files
// are expected to change path. Everything else must not get worse than it already was. Bulk
// deletes also go through here and refresh the cached balances and available amounts afterwards;
// a deletion may leave available negative, which is reported rather than refused.
const NOT_JUDGED = new Set<ValidationIssue["type"]>(["monthTotals", "accountBalance", "accountAvailable", "negativeAvailable", "pathMismatch", "inTransit"]);

function countByType(issues: ValidationIssue[]): Map<ValidationIssue["type"], number> {
	const counts = new Map<ValidationIssue["type"], number>();
	for (const i of issues) if (!NOT_JUDGED.has(i.type)) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
	return counts;
}

function simulate(before: NoteInput[], changes: FileChange[]): NoteInput[] {
	const replaced = new Set(changes.map((c) => c.fromPath));
	const kept = before.filter((n) => !replaced.has(n.path));
	return [...kept, ...changes.map((c) => ({ path: c.toPath, props: parseProps(c.content), content: c.content }))];
}

async function precheck(port: VaultPort, changes: FileChange[]): Promise<void> {
	const targets = new Set<string>();
	for (const c of changes) {
		if (targets.has(c.toPath)) throw new RenameError(`Two notes would end up at ${c.toPath}`);
		targets.add(c.toPath);
		const staged = transitPath(c.toPath);
		if (port.exists(staged)) throw new RenameError(`${staged} is left over from an earlier change; resolve it first`);
		if (c.toPath !== c.fromPath && port.exists(c.toPath)) throw new RenameError(`${c.toPath} already exists`);
	}
}

async function discardStaged(port: VaultPort, staged: string[]): Promise<void> {
	for (const path of staged) await port.trash(path);
}

// Stage new copies marked in_transit, validate the staged set, then swap. Current files are not
// touched until validation passes, so a failure before the swap only deletes the staged copies.
export async function executePlan(port: VaultPort, plan: RenamePlan): Promise<void> {
	const { changes } = plan;
	if (changes.length === 0) return;
	await precheck(port, changes);

	const before = await loadInputs(port);
	const beforeCounts = countByType(validateSnapshot(buildSnapshot(before)));

	const staged: string[] = [];
	try {
		for (const c of changes) {
			const path = transitPath(c.toPath);
			await port.create(path, markInTransit(c.content, c.fromPath));
			staged.push(path);
		}
	} catch (e) {
		await discardStaged(port, staged);
		throw e;
	}

	const after = validateSnapshot(buildSnapshot(simulate(before, changes)));
	const grew = [...countByType(after)].filter(([type, n]) => n > (beforeCounts.get(type) ?? 0)).map(([type]) => type);
	const worse = after.filter((i) => grew.includes(i.type));
	if (worse.length > 0) {
		await discardStaged(port, staged);
		throw new RenameValidationError(worse);
	}

	for (const c of changes) {
		await port.trash(c.fromPath);
		await port.rename(transitPath(c.toPath), c.toPath);
		await port.modify(c.toPath, markCurrent);
	}
	await cleanupEmptyFolders(port, changes.filter((c) => c.fromPath !== c.toPath).map((c) => c.fromPath));
}
