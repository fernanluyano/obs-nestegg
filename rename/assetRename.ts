import { nameProblem } from "../domain/names";
import { patchProps } from "../notes/frontmatter";
import { assetPath } from "../notes/paths";
import { RenameError, type PlanContext, type RenamePlan } from "./types";

// Nothing else refers to an asset by name, so a rename rewrites the one note: its name property,
// and the file moves to the new name.
export async function planAssetRename(ctx: PlanContext, oldName: string, newName: string): Promise<RenamePlan> {
	const { snapshot, read } = ctx;
	const record = snapshot.assets.find((a) => a.asset.name === oldName);
	if (!record) throw new RenameError(`No asset named "${oldName}"`);
	if (oldName === newName) throw new RenameError("The new name is the same as the old one");
	if (nameProblem(newName)) throw new RenameError(`"${newName}" is not a valid name`);
	if (snapshot.assets.some((a) => a.asset.name === newName)) throw new RenameError(`An asset named "${newName}" already exists`);

	return {
		changes: [{ fromPath: record.path, toPath: assetPath(newName), content: patchProps(await read(record.path), { name: newName }) }],
	};
}
