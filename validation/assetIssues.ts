import type { Snapshot } from "../snapshot/snapshot";
import type { DuplicateNameIssue } from "./issues";

export function detectDuplicateAssets(snapshot: Snapshot): DuplicateNameIssue[] {
	const byName = new Map<string, string[]>();
	for (const { path, asset } of snapshot.assets) byName.set(asset.name, [...(byName.get(asset.name) ?? []), path]);
	return [...byName]
		.filter(([, paths]) => paths.length > 1)
		.map(([name, paths]) => ({ type: "duplicateName", kind: "asset", name, paths }));
}
