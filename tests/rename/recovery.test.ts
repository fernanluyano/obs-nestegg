import { describe, expect, it } from "vitest";
import { parseProps } from "../../notes/frontmatter";
import { markInTransit } from "../../notes/transit";
import { discardTransit, finalPathOf, promoteTransit } from "../../rename/recovery";
import { RenameError } from "../../rename/types";
import { buildAccountNote } from "../../notes/accountNote";
import { account } from "../helpers/fixtures";
import { MemoryVault } from "../helpers/memoryVault";

const OLD = "Nestegg/Accounts/Cash Main/Cash Main.md";
const FINAL = "Nestegg/Accounts/Wallet/Wallet.md";
const STAGED = "Nestegg/Accounts/Wallet/Wallet (in transit).md";
const staged = () => markInTransit(buildAccountNote(account({ name: "Wallet" })), OLD);

describe("finalPathOf", () => {
	it("strips the staging suffix", () => {
		expect(finalPathOf(STAGED)).toBe(FINAL);
	});

	it("rejects a path that is not a staged copy", () => {
		expect(() => finalPathOf(FINAL)).toThrow(RenameError);
	});
});

describe("discardTransit", () => {
	it("trashes only the staged copy", async () => {
		const vault = new MemoryVault({ [OLD]: "old", [STAGED]: staged() });
		await discardTransit(vault, STAGED);
		expect([...vault.files.keys()]).toEqual([OLD]);
		expect(vault.trashed).toEqual([STAGED]);
	});
});

describe("promoteTransit", () => {
	it("replaces the old note with the staged copy and marks it current", async () => {
		const vault = new MemoryVault({ [OLD]: "old", [STAGED]: staged() });
		await promoteTransit(vault, STAGED);
		expect([...vault.files.keys()]).toEqual([FINAL]);
		const props = parseProps(vault.files.get(FINAL)!);
		expect(props.state).toBe("current");
		expect(props.transitFor).toBeUndefined();
		expect(vault.trashed).toEqual([OLD]);
		expect(vault.removedFolders).toEqual(["Nestegg/Accounts/Cash Main"]);
	});

	it("finishes a swap that already removed the old note", async () => {
		const vault = new MemoryVault({ [STAGED]: staged() });
		await promoteTransit(vault, STAGED);
		expect(vault.exists(FINAL)).toBe(true);
		expect(vault.trashed).toEqual([]);
	});

	it("replaces a note at the same path", async () => {
		const path = "Nestegg/Categories/Food.md";
		const stagedPath = "Nestegg/Categories/Food (in transit).md";
		const vault = new MemoryVault({ [path]: "old", [stagedPath]: markInTransit("---\nname: Food\n---\nnew", path) });
		await promoteTransit(vault, stagedPath);
		expect(vault.files.get(path)).toContain("new");
		expect(vault.removedFolders).toEqual([]);
	});

	it("refuses when something unrelated already sits at the final path", async () => {
		const vault = new MemoryVault({ [OLD]: "old", [FINAL]: "someone else", [STAGED]: staged() });
		await expect(promoteTransit(vault, STAGED)).rejects.toThrow(/already exists/);
		expect(vault.exists(OLD)).toBe(true);
		expect(vault.exists(STAGED)).toBe(true);
	});

	it("refuses a staged copy that is gone", async () => {
		await expect(promoteTransit(new MemoryVault(), STAGED)).rejects.toThrow(/no longer exists/);
	});

	it("promotes a staged copy that records nothing to replace", async () => {
		const vault = new MemoryVault({ [STAGED]: "---\nstate: in_transit\n---\nbody" });
		await promoteTransit(vault, STAGED);
		expect(vault.exists(FINAL)).toBe(true);
	});
});
