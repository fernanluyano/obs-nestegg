import { ASSET_TYPES, assetNameProblem, valuationProblem, type Asset, type AssetType, type Valuation } from "../domain/assets";
import { isHexColor, nextAccountColor } from "../domain/colors";
import { buildAssetNote, upsertValuationRow } from "../notes/assetNote";
import { patchProps } from "../notes/frontmatter";
import { assetPath } from "../notes/paths";
import { planAssetRename } from "../rename/assetRename";
import { executePlan } from "../rename/execute";
import { findAsset } from "../snapshot/assetQueries";
import { LedgerError } from "./errors";
import type { LedgerStore } from "./LedgerStore";

export interface NewAsset {
	name: string;
	assetType: AssetType;
	color?: string; // defaults to the next palette color no account or asset uses
	valueCents: number; // the first row of the history
	date: string;
	note?: string;
}

function checkValuation(valuation: Pick<Valuation, "date" | "valueCents">): void {
	const problem = valuationProblem(valuation);
	if (problem === "invalidDate") throw new LedgerError("The valuation date is not a valid date");
	if (problem === "invalidValue") throw new LedgerError("The value must be zero or more");
}

export class AssetService {
	constructor(private store: LedgerStore) {}

	private require(name: string) {
		const record = findAsset(this.store.snapshot, name);
		if (!record) throw new LedgerError(`No asset named "${name}"`);
		return record;
	}

	async create(input: NewAsset): Promise<void> {
		const { snapshot, port } = this.store;
		const problem = assetNameProblem(snapshot.assets.map((a) => a.asset), input.name);
		if (problem === "duplicate") throw new LedgerError(`An asset named "${input.name}" already exists`);
		if (problem) throw new LedgerError(`"${input.name}" is not a valid asset name`);
		if (!ASSET_TYPES.includes(input.assetType)) throw new LedgerError("The asset type is not valid");
		if (input.color !== undefined && !isHexColor(input.color)) throw new LedgerError("The color is not a valid #rrggbb color");
		checkValuation(input);

		const used = [...snapshot.accounts.map((a) => a.account.color), ...snapshot.assets.map((a) => a.asset.color)];
		const asset: Asset = {
			name: input.name,
			assetType: input.assetType,
			active: true,
			color: (input.color ?? nextAccountColor(used)).toLowerCase(),
		};
		await port.create(assetPath(input.name), buildAssetNote(asset, [{ date: input.date, valueCents: input.valueCents, note: (input.note ?? "").trim() }]));
		await this.store.reload();
	}

	// A row for the date is replaced; otherwise the row is added and the table kept sorted by date.
	async addValuation(name: string, valuation: Valuation): Promise<void> {
		const record = this.require(name);
		checkValuation(valuation);
		await this.store.port.modify(record.path, (content) => upsertValuationRow(content, { ...valuation, note: valuation.note.trim() }));
		await this.store.reload();
	}

	// Everything is checked before anything is written, so a bad name never leaves the color changed.
	async edit(name: string, changes: { name?: string; color?: string }): Promise<void> {
		const record = this.require(name);
		const { snapshot } = this.store;
		const nextName = changes.name ?? name;
		const problem = assetNameProblem(snapshot.assets.map((a) => a.asset), nextName, name);
		if (problem === "duplicate") throw new LedgerError(`An asset named "${nextName}" already exists`);
		if (problem) throw new LedgerError(`"${nextName}" is not a valid asset name`);
		if (changes.color !== undefined && !isHexColor(changes.color)) throw new LedgerError("The color is not a valid #rrggbb color");

		const color = changes.color?.toLowerCase();
		if (color !== undefined && color !== record.asset.color) {
			await this.store.port.modify(record.path, (c) => patchProps(c, { color }));
			await this.store.reload();
		}
		if (nextName !== name) await this.rename(name, nextName);
	}

	async rename(oldName: string, newName: string): Promise<void> {
		const { snapshot, port } = this.store;
		const plan = await planAssetRename({ snapshot, read: async (p) => (await port.read(p)) ?? "" }, oldName, newName);
		await executePlan(port, plan);
		await this.store.reload();
	}

	// Archiving is how an asset is let go, a sale included. The note and its history stay in the vault.
	async archive(name: string): Promise<void> {
		const record = this.require(name);
		await this.store.port.modify(record.path, (c) => patchProps(c, { active: false }));
		await this.store.reload();
	}
}
