import { describe, expect, it } from "vitest";
import { readValuations } from "../../notes/assetNote";
import { parseProps } from "../../notes/frontmatter";
import { assetPath } from "../../notes/paths";
import { activeAssets, findAsset } from "../../snapshot/assetQueries";
import { LedgerError } from "../../services/errors";
import { validateSnapshot } from "../../validation/validate";
import { loadedLedger } from "../helpers/ledgerFixture";

const base = { name: "House", assetType: "house" as const, valueCents: 45000000, date: "2022-09-01" };

async function ledgerWithHouse() {
	const loaded = await loadedLedger();
	await loaded.ledger.assets.create({ ...base, note: "Purchase price" });
	return loaded;
}

const rowsOf = (vault: { files: Map<string, string> }, name: string) => readValuations(vault.files.get(assetPath(name))!).valuations;

describe("create", () => {
	it("writes one flat note with the first row of the history", async () => {
		const { ledger, vault } = await ledgerWithHouse();
		expect(vault.files.has("Nestegg/Assets/House.md")).toBe(true);
		expect(parseProps(vault.files.get(assetPath("House"))!)).toMatchObject({ name: "House", assetType: "house", active: true });
		expect(rowsOf(vault, "House")).toEqual([{ date: "2022-09-01", valueCents: 45000000, note: "Purchase price" }]);
		expect(findAsset(ledger.snapshot, "House")?.asset).toMatchObject({ name: "House", assetType: "house", active: true });
	});

	it("starts the history with an empty note when none is given", async () => {
		const { ledger } = await loadedLedger();
		await ledger.assets.create({ ...base, name: "Gold", assetType: "metal" });
		expect(findAsset(ledger.snapshot, "Gold")?.valuations).toEqual([{ date: "2022-09-01", valueCents: 45000000, note: "" }]);
	});

	it("trims the note of the first row", async () => {
		const { ledger } = await loadedLedger();
		await ledger.assets.create({ ...base, note: "  Bought new  " });
		expect(findAsset(ledger.snapshot, "House")?.valuations[0].note).toBe("Bought new");
	});

	it("gives the next palette color no account or asset uses, or the one given in lower case", async () => {
		const { ledger } = await loadedLedger();
		await ledger.assets.create({ ...base, name: "A" });
		await ledger.assets.create({ ...base, name: "B" });
		await ledger.assets.create({ ...base, name: "C", color: "#ABCDEF" });
		expect(["A", "B", "C"].map((n) => findAsset(ledger.snapshot, n)!.asset.color)).toEqual(["#3e63dd", "#30a46c", "#abcdef"]);
	});

	it("rejects bad names, duplicates, bad types, colors, dates and values, and writes nothing", async () => {
		const { ledger, vault } = await ledgerWithHouse();
		const before = new Map(vault.files);
		await expect(ledger.assets.create({ ...base, name: "a/b" })).rejects.toThrow(/valid asset name/);
		await expect(ledger.assets.create({ ...base, name: "" })).rejects.toThrow(/valid asset name/);
		await expect(ledger.assets.create({ ...base, name: "House" })).rejects.toThrow(/already exists/);
		await expect(ledger.assets.create({ ...base, name: "X", assetType: "boat" as never })).rejects.toThrow(/type/);
		await expect(ledger.assets.create({ ...base, name: "X", color: "red" })).rejects.toThrow(/color/);
		await expect(ledger.assets.create({ ...base, name: "X", date: "nope" })).rejects.toThrow(/date/);
		await expect(ledger.assets.create({ ...base, name: "X", valueCents: -1 })).rejects.toThrow(/zero or more/);
		await expect(ledger.assets.create({ ...base, name: "X", valueCents: 1.5 })).rejects.toThrow(LedgerError);
		expect(vault.files).toEqual(before);
	});

	it("leaves the accounts and their balances alone", async () => {
		const { ledger } = await loadedLedger();
		const before = JSON.stringify(ledger.snapshot.accounts);
		await ledger.assets.create(base);
		expect(JSON.stringify(ledger.snapshot.accounts)).toBe(before);
	});
});

describe("addValuation", () => {
	it("adds a row for a new date and keeps the table sorted by date", async () => {
		const { ledger, vault } = await ledgerWithHouse();
		await ledger.assets.addValuation("House", { date: "2026-06-15", valueCents: 52000000, note: "Zillow" });
		await ledger.assets.addValuation("House", { date: "2024-03-10", valueCents: 49000000, note: "Appraisal" });
		expect(rowsOf(vault, "House").map((v) => v.date)).toEqual(["2022-09-01", "2024-03-10", "2026-06-15"]);
		expect(findAsset(ledger.snapshot, "House")!.valuations).toHaveLength(3);
	});

	it("replaces the row of a date that already has one", async () => {
		const { ledger, vault } = await ledgerWithHouse();
		await ledger.assets.addValuation("House", { date: "2022-09-01", valueCents: 46000000, note: "Corrected" });
		expect(rowsOf(vault, "House")).toEqual([{ date: "2022-09-01", valueCents: 46000000, note: "Corrected" }]);
	});

	it("trims the note", async () => {
		const { ledger, vault } = await ledgerWithHouse();
		await ledger.assets.addValuation("House", { date: "2023-01-01", valueCents: 1, note: "  spaced  " });
		expect(rowsOf(vault, "House")[1].note).toBe("spaced");
	});

	it("refuses an unknown asset and an invalid date or value", async () => {
		const { ledger, vault } = await ledgerWithHouse();
		const before = vault.files.get(assetPath("House"));
		await expect(ledger.assets.addValuation("Nope", { date: "2023-01-01", valueCents: 1, note: "" })).rejects.toThrow(/No asset named "Nope"/);
		await expect(ledger.assets.addValuation("House", { date: "nope", valueCents: 1, note: "" })).rejects.toThrow(/date/);
		await expect(ledger.assets.addValuation("House", { date: "2023-01-01", valueCents: -5, note: "" })).rejects.toThrow(/zero or more/);
		expect(vault.files.get(assetPath("House"))).toBe(before);
	});

	it("refuses a note whose table has unreadable rows", async () => {
		const { ledger, vault } = await ledgerWithHouse();
		vault.files.set(assetPath("House"), vault.files.get(assetPath("House"))!.replace("| 45000000 |", "| oops |"));
		await ledger.reload();
		await expect(ledger.assets.addValuation("House", { date: "2023-01-01", valueCents: 1, note: "" })).rejects.toThrow(/unreadable rows/);
	});
});

describe("rename", () => {
	it("moves the note to the new name and keeps its history", async () => {
		const { ledger, vault } = await ledgerWithHouse();
		await ledger.assets.addValuation("House", { date: "2026-06-15", valueCents: 52000000, note: "" });
		await ledger.assets.rename("House", "Home");
		expect(vault.files.has(assetPath("House"))).toBe(false);
		expect(parseProps(vault.files.get(assetPath("Home"))!).name).toBe("Home");
		expect(findAsset(ledger.snapshot, "Home")!.valuations).toHaveLength(2);
		expect(findAsset(ledger.snapshot, "House")).toBeUndefined();
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("refuses an unknown asset, the same name, a bad name and a taken one", async () => {
		const { ledger } = await ledgerWithHouse();
		await ledger.assets.create({ ...base, name: "Gold", assetType: "metal" });
		await expect(ledger.assets.rename("Nope", "X")).rejects.toThrow(/No asset named/);
		await expect(ledger.assets.rename("House", "House")).rejects.toThrow(/same as the old/);
		await expect(ledger.assets.rename("House", "a/b")).rejects.toThrow(/not a valid name/);
		await expect(ledger.assets.rename("House", "Gold")).rejects.toThrow(/already exists/);
	});

	it("leaves the vault as it was when the swap cannot be staged", async () => {
		const { ledger, vault } = await ledgerWithHouse();
		const before = new Map(vault.files);
		vault.failOn("create", "Nestegg/Assets/Home (in transit).md");
		await expect(ledger.assets.rename("House", "Home")).rejects.toThrow();
		expect(vault.files).toEqual(before);
	});
});

describe("edit", () => {
	it("changes the name and the color together, keeping the history", async () => {
		const { ledger, vault } = await ledgerWithHouse();
		await ledger.assets.edit("House", { name: "Home", color: "#ABCDEF" });
		expect(vault.files.has(assetPath("House"))).toBe(false);
		expect(findAsset(ledger.snapshot, "Home")?.asset).toMatchObject({ name: "Home", color: "#abcdef" });
		expect(findAsset(ledger.snapshot, "Home")!.valuations).toHaveLength(1);
		expect(validateSnapshot(ledger.snapshot)).toEqual([]);
	});

	it("changes only the color, leaving the file where it is", async () => {
		const { ledger, vault } = await ledgerWithHouse();
		await ledger.assets.edit("House", { name: "House", color: "#e5484d" });
		expect(parseProps(vault.files.get(assetPath("House"))!).color).toBe("#e5484d");
		expect(findAsset(ledger.snapshot, "House")?.asset.color).toBe("#e5484d");
	});

	it("changes only the name when no color is given", async () => {
		const { ledger } = await ledgerWithHouse();
		const color = findAsset(ledger.snapshot, "House")!.asset.color;
		await ledger.assets.edit("House", { name: "Home" });
		expect(findAsset(ledger.snapshot, "Home")?.asset.color).toBe(color);
	});

	it("writes nothing when nothing changes", async () => {
		const { ledger, vault } = await ledgerWithHouse();
		const before = new Map(vault.files);
		await ledger.assets.edit("House", { name: "House" });
		await ledger.assets.edit("House", {});
		expect(vault.files).toEqual(before);
	});

	it("refuses an unknown asset, a bad or taken name and a bad color, without changing the color", async () => {
		const { ledger, vault } = await ledgerWithHouse();
		await ledger.assets.create({ ...base, name: "Gold", assetType: "metal" });
		const before = new Map(vault.files);
		await expect(ledger.assets.edit("Nope", { name: "X" })).rejects.toThrow(/No asset named/);
		await expect(ledger.assets.edit("House", { name: "a/b", color: "#e5484d" })).rejects.toThrow(/valid asset name/);
		await expect(ledger.assets.edit("House", { name: "", color: "#e5484d" })).rejects.toThrow(/valid asset name/);
		await expect(ledger.assets.edit("House", { name: "Gold", color: "#e5484d" })).rejects.toThrow(/already exists/);
		await expect(ledger.assets.edit("House", { color: "red" })).rejects.toThrow(/color/);
		expect(vault.files).toEqual(before);
	});
});

describe("archive", () => {
	it("marks the note inactive, hides the asset, and keeps the note and its history", async () => {
		const { ledger, vault } = await ledgerWithHouse();
		await ledger.assets.archive("House");
		expect(vault.files.has(assetPath("House"))).toBe(true);
		expect(parseProps(vault.files.get(assetPath("House"))!).active).toBe(false);
		expect(rowsOf(vault, "House")).toHaveLength(1);
		expect(activeAssets(ledger.snapshot)).toEqual([]);
		expect(findAsset(ledger.snapshot, "House")?.asset.active).toBe(false);
	});

	it("refuses an unknown asset", async () => {
		const { ledger } = await loadedLedger();
		await expect(ledger.assets.archive("Nope")).rejects.toThrow(/No asset named/);
	});
});
