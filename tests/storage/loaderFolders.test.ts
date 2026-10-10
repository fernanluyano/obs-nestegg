import { describe, expect, it } from "vitest";
import { cleanupEmptyFolders } from "../../storage/folders";
import { loadInputs, loadSnapshot } from "../../storage/loader";
import { markInTransit } from "../../notes/transit";
import { buildAccountNote } from "../../notes/accountNote";
import { MemoryVault } from "../helpers/memoryVault";
import { account, tx, vaultInputs, monthInput } from "../helpers/fixtures";

describe("loadInputs / loadSnapshot", () => {
	it("loads plugin notes and skips everything else", async () => {
		const vault = MemoryVault.fromInputs(vaultInputs());
		vault.files.set("Daily/today.md", "---\ntags: [daily]\n---\nhi");
		vault.files.set("image.png", "binary");
		const inputs = await loadInputs(vault);
		expect(inputs.map((i) => i.path)).not.toContain("Daily/today.md");
		expect(inputs.length).toBe(vaultInputs().length);
	});

	it("reads bodies only for accounts, categories, month files and budgets", async () => {
		const inputs = await loadInputs(MemoryVault.fromInputs(vaultInputs()));
		const by = (suffix: string) => inputs.find((i) => i.path.endsWith(suffix))!;
		expect(by("Food.md").content).toContain("| Subcategory |");
		expect(by("2026-10.md").content).toContain("| Date |");
		expect(by("Cash Main.md").content).toContain("accountType: cash");
		expect(by("Settings.md").content).toBe("");
	});

	it("does not read staged copies", async () => {
		const vault = MemoryVault.fromInputs(vaultInputs());
		const staged = markInTransit(monthInput("Cash Main", "2026-10", [tx()]).content, "x.md");
		vault.files.set("Nestegg/Accounts/Cash Main/Transactions/2026-10 (in transit).md", staged);
		const input = (await loadInputs(vault)).find((i) => i.path.endsWith("(in transit).md"))!;
		expect(input.content).toBe("");
	});

	it("builds a snapshot from the vault", async () => {
		const snap = await loadSnapshot(MemoryVault.fromInputs(vaultInputs()));
		expect(snap.accounts).toHaveLength(1);
		expect(snap.months[0].transactions).toEqual([tx()]);
	});

	it("treats a note that vanished between listing and reading as empty", async () => {
		const vault = MemoryVault.fromInputs(vaultInputs());
		const original = vault.listNotes.bind(vault);
		vault.listNotes = async () => {
			const notes = await original();
			vault.files.delete("Nestegg/Accounts/Cash Main/Transactions/2026-10.md");
			return notes;
		};
		const snap = await loadSnapshot(vault);
		expect(snap.months).toHaveLength(1);
		expect(snap.months[0].transactions).toEqual([]);
		expect(snap.invalid).toEqual([]);
	});
});

describe("cleanupEmptyFolders", () => {
	it("removes the emptied folders up to, but not including, the protected ones", async () => {
		const vault = new MemoryVault({ "Nestegg/Accounts/Other/Other.md": buildAccountNote(account({ name: "Other" })) });
		await cleanupEmptyFolders(vault, ["Nestegg/Accounts/Old/Transactions/2026-10.md"]);
		expect(vault.removedFolders).toEqual(["Nestegg/Accounts/Old/Transactions", "Nestegg/Accounts/Old"]);
	});

	it("leaves folders that still hold files", async () => {
		const vault = new MemoryVault({ "Nestegg/Accounts/Old/Old.md": "x" });
		await cleanupEmptyFolders(vault, ["Nestegg/Accounts/Old/Transactions/2026-10.md"]);
		expect(vault.removedFolders).toEqual(["Nestegg/Accounts/Old/Transactions"]);
	});

	it("removes each shared folder once, deepest first, across several moved files", async () => {
		const vault = new MemoryVault();
		await cleanupEmptyFolders(vault, [
			"Nestegg/Accounts/Old/Old.md",
			"Nestegg/Accounts/Old/Transactions/2026-10.md",
			"Nestegg/Accounts/Old/Transactions/2026-09.md",
		]);
		expect(vault.removedFolders).toEqual(["Nestegg/Accounts/Old/Transactions", "Nestegg/Accounts/Old"]);
	});

	it("does nothing for a file at the top level", async () => {
		const vault = new MemoryVault();
		await cleanupEmptyFolders(vault, ["Settings.md"]);
		expect(vault.removedFolders).toEqual([]);
	});
});
