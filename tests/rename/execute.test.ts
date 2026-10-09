import { describe, expect, it } from "vitest";
import { parseProps } from "../../notes/frontmatter";
import { executePlan, RenameValidationError } from "../../rename/execute";
import { planAccountRename } from "../../rename/accountRename";
import { planCategoryRename } from "../../rename/categoryRename";
import { RenameError } from "../../rename/types";
import { loadSnapshot } from "../../storage/loader";
import { validateSnapshot } from "../../validation/validate";
import { MemoryVault } from "../helpers/memoryVault";
import { account, monthInput, tx, vaultInputs } from "../helpers/fixtures";

const out = tx({ subcategory: "Account transfer", amountCents: -5000, fromTo: "Savings", merchant: "" });
const inn = tx({ subcategory: "Account transfer", amountCents: 5000, fromTo: "Cash Main", merchant: "" });

function setup() {
	const inputs = vaultInputs({
		accounts: [account({ balanceCents: 200000 - 8450 - 5000 }), account({ name: "Savings", balanceCents: 205000 })],
		months: [monthInput("Cash Main", "2026-10", [tx(), out]), monthInput("Savings", "2026-10", [inn])],
	});
	const vault = MemoryVault.fromInputs(inputs);
	const ctx = async () => {
		const snapshot = await loadSnapshot(vault);
		return { snapshot, read: async (p: string) => (await vault.read(p))! };
	};
	return { vault, ctx };
}

describe("executePlan", () => {
	it("renames an account across every file and leaves a clean, consistent vault", async () => {
		const { vault, ctx } = setup();
		await executePlan(vault, await planAccountRename(await ctx(), "Cash Main", "Wallet"));

		expect(vault.exists("Nestegg/Accounts/Wallet/Wallet.md")).toBe(true);
		expect(vault.exists("Nestegg/Accounts/Wallet/Transactions/2026-10.md")).toBe(true);
		expect(vault.exists("Nestegg/Accounts/Cash Main/Cash Main.md")).toBe(false);
		expect([...vault.files.keys()].some((p) => p.includes("(in transit)"))).toBe(false);

		const snap = await loadSnapshot(vault);
		expect(validateSnapshot(snap)).toEqual([]);
		expect(snap.settings?.settings.defaultAccount).toBe("Wallet");
		expect(snap.months.find((m) => m.account === "Savings")!.transactions[0].fromTo).toBe("Wallet");
		expect(parseProps(vault.files.get("Nestegg/Accounts/Wallet/Wallet.md")!).state).toBe("current");
	});

	it("cleans up the old account folders and sends old notes to the trash", async () => {
		const { vault, ctx } = setup();
		await executePlan(vault, await planAccountRename(await ctx(), "Cash Main", "Wallet"));
		expect(vault.removedFolders).toEqual(["Nestegg/Accounts/Cash Main/Transactions", "Nestegg/Accounts/Cash Main"]);
		expect(vault.trashed).toContain("Nestegg/Accounts/Cash Main/Cash Main.md");
	});

	it("renames a category and cascades into month files", async () => {
		const { vault, ctx } = setup();
		const misc = tx({ subcategory: "Food - Misc", note: "m", amountCents: 0 });
		vault.files.set("Nestegg/Accounts/Cash Main/Transactions/2026-11.md", monthInput("Cash Main", "2026-11", [misc]).content);
		await executePlan(vault, await planCategoryRename(await ctx(), "Food", "Eats"));
		const snap = await loadSnapshot(vault);
		expect(snap.months.find((m) => m.month === "2026-11")!.transactions[0].subcategory).toBe("Eats - Misc");
		expect(validateSnapshot(snap)).toEqual([]);
	});

	it("does nothing for an empty plan", async () => {
		const { vault } = setup();
		const before = new Map(vault.files);
		await executePlan(vault, { changes: [] });
		expect(vault.files).toEqual(before);
	});

	it("aborts and discards staged copies when validation says the data would get worse", async () => {
		const { vault, ctx } = setup();
		const plan = await planAccountRename(await ctx(), "Cash Main", "Wallet");
		const settings = plan.changes.find((c) => c.fromPath.endsWith("Settings.md"))!;
		plan.changes = plan.changes.filter((c) => c !== settings);
		const savings = plan.changes.find((c) => c.fromPath.includes("Savings"))!;
		savings.content = savings.content.replace("| Wallet |", "| Elsewhere |");

		const before = new Map(vault.files);
		const error = await executePlan(vault, plan).catch((e) => e);
		expect(error).toBeInstanceOf(RenameValidationError);
		expect((error as RenameValidationError).issues.map((i) => i.type)).toContain("transfer");
		expect(vault.files).toEqual(before);
		expect(vault.trashed.every((p) => p.includes("(in transit)"))).toBe(true);
	});

	it("does not block on problems that already existed", async () => {
		const { vault, ctx } = setup();
		vault.files.set("Nestegg/Accounts/Ghost/Transactions/2026-10.md", monthInput("Ghost", "2026-10", [tx()]).content);
		await executePlan(vault, await planAccountRename(await ctx(), "Savings", "Nest"));
		expect(vault.exists("Nestegg/Accounts/Nest/Nest.md")).toBe(true);
	});

	it("rolls back staged copies when staging itself fails", async () => {
		const { vault, ctx } = setup();
		const plan = await planAccountRename(await ctx(), "Cash Main", "Wallet");
		const second = plan.changes[1];
		vault.failOn("create", `${second.toPath.replace(/\.md$/, "")} (in transit).md`);
		const before = new Map(vault.files);
		await expect(executePlan(vault, plan)).rejects.toThrow(/create failed/);
		expect(vault.files).toEqual(before);
	});

	it("refuses when a destination or staging path is already taken, or two notes collide", async () => {
		const { vault, ctx } = setup();
		const plan = await planAccountRename(await ctx(), "Cash Main", "Wallet");
		vault.files.set("Nestegg/Accounts/Wallet/Wallet.md", "occupied");
		await expect(executePlan(vault, plan)).rejects.toThrow(/already exists/);
		vault.files.delete("Nestegg/Accounts/Wallet/Wallet.md");

		vault.files.set("Nestegg/Accounts/Wallet/Wallet (in transit).md", "left over");
		await expect(executePlan(vault, plan)).rejects.toThrow(/left over/);
		vault.files.delete("Nestegg/Accounts/Wallet/Wallet (in transit).md");

		const clash = { changes: [plan.changes[0], { ...plan.changes[1], toPath: plan.changes[0].toPath }] };
		await expect(executePlan(vault, clash)).rejects.toThrow(RenameError);
	});

	it("leaves the staged copies for recovery if the swap is interrupted", async () => {
		const { vault, ctx } = setup();
		const plan = await planAccountRename(await ctx(), "Cash Main", "Wallet");
		vault.failOn("rename", "Nestegg/Accounts/Wallet/Transactions/2026-10 (in transit).md");
		await expect(executePlan(vault, plan)).rejects.toThrow(/rename failed/);
		const leftover = [...vault.files.keys()].filter((p) => p.includes("(in transit)"));
		expect(leftover.length).toBeGreaterThan(0);
		const snap = await loadSnapshot(vault);
		expect(snap.transit.length).toBe(leftover.length);
		expect(validateSnapshot(snap).some((i) => i.type === "inTransit")).toBe(true);
	});

	it("replaces a note in place when only its content changes", async () => {
		const { vault } = setup();
		const path = "Nestegg/Categories/Food.md";
		const content = vault.files.get(path)!.replace("| Groceries | expense |", "| Groceries | expense |\n| Coffee | expense |");
		await executePlan(vault, { changes: [{ fromPath: path, toPath: path, content }] });
		expect(vault.files.get(path)).toContain("| Coffee |");
		expect(parseProps(vault.files.get(path)!).state).toBe("current");
		expect(vault.removedFolders).toEqual([]);
	});

	it("records which file each staged copy replaces", async () => {
		const { vault, ctx } = setup();
		const plan = await planAccountRename(await ctx(), "Cash Main", "Wallet");
		vault.failOn("trash", "Nestegg/Accounts/Cash Main/Cash Main.md");
		await expect(executePlan(vault, plan)).rejects.toThrow(/trash failed/);
		const stagedNote = vault.files.get("Nestegg/Accounts/Wallet/Wallet (in transit).md")!;
		expect(parseProps(stagedNote)).toMatchObject({ state: "in_transit", transitFor: "Nestegg/Accounts/Cash Main/Cash Main.md" });
	});
});
