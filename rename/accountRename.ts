import { nameProblem } from "../domain/names";
import { patchProps } from "../notes/frontmatter";
import { accountPath, monthPath } from "../notes/paths";
import { mapColumn } from "../notes/tableColumns";
import { RenameError, type FileChange, type PlanContext, type RenamePlan } from "./types";

const FROM_TO = "FromTo";

// An account rename rewrites: the account note's name, the `account` property of its month files
// (which also move into the new folder), FromTo cells in every other account's transfer rows,
// and the default account in Settings when it names the old one.
export async function planAccountRename(ctx: PlanContext, oldName: string, newName: string): Promise<RenamePlan> {
	const { snapshot, read } = ctx;
	const record = snapshot.accounts.find((a) => a.account.name === oldName);
	if (!record) throw new RenameError(`No account named "${oldName}"`);
	if (oldName === newName) throw new RenameError("The new name is the same as the old one");
	if (nameProblem(newName)) throw new RenameError(`"${newName}" is not a valid name`);
	if (snapshot.accounts.some((a) => a.account.name === newName)) throw new RenameError(`An account named "${newName}" already exists`);

	const changes: FileChange[] = [];
	changes.push({
		fromPath: record.path,
		toPath: accountPath(newName),
		content: patchProps(await read(record.path), { name: newName }),
	});

	for (const month of snapshot.months) {
		const own = month.account === oldName;
		const mentions = month.transactions.some((tx) => tx.fromTo === oldName);
		if (!own && !mentions) continue;

		let content = await read(month.path);
		if (own) content = patchProps(content, { account: newName });
		if (mentions) content = mapColumn(content, "Date", FROM_TO, (v) => (v === oldName ? newName : v));
		changes.push({ fromPath: month.path, toPath: own ? monthPath(newName, month.month) : month.path, content });
	}

	if (snapshot.settings?.settings.defaultAccount === oldName) {
		const { path } = snapshot.settings;
		changes.push({ fromPath: path, toPath: path, content: patchProps(await read(path), { defaultAccount: newName }) });
	}
	return { changes };
}
