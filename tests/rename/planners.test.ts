import { beforeEach, describe, expect, it } from "vitest";
import { parseProps } from "../../notes/frontmatter";
import { planAccountRename } from "../../rename/accountRename";
import { planCategoryRename, planSubcategoryRename } from "../../rename/categoryRename";
import { RenameError, type PlanContext } from "../../rename/types";
import { buildSnapshot } from "../../snapshot/snapshot";
import { account, monthInput, tx, vaultInputs } from "../helpers/fixtures";

const transferOut = tx({ subcategory: "Account transfer", amountCents: -5000, fromTo: "Savings", merchant: "" });
const transferIn = tx({ subcategory: "Account transfer", amountCents: 5000, fromTo: "Cash Main", merchant: "" });

function context(): PlanContext {
	const inputs = vaultInputs({
		accounts: [account({ balanceCents: 200000 - 8450 - 5000 }), account({ name: "Savings", balanceCents: 200000 + 5000 })],
		months: [
			monthInput("Cash Main", "2026-10", [tx(), transferOut, tx({ subcategory: "Food - Misc", note: "misc" })]),
			monthInput("Cash Main", "2026-09", [tx({ date: "2026-09-02", note: "old" })]),
			monthInput("Savings", "2026-10", [transferIn]),
		],
    });
	const files = new Map(inputs.map((i) => [i.path, i.content]));
	return { snapshot: buildSnapshot(inputs), read: async (p) => files.get(p)! };
}

let ctx: PlanContext;
beforeEach(() => { ctx = context(); });

describe("planAccountRename", () => {
	it("renames the note, moves its month files and rewrites FromTo elsewhere", async () => {
		const { changes } = await planAccountRename(ctx, "Cash Main", "Wallet");
		const byFrom = new Map(changes.map((c) => [c.fromPath, c]));

		const note = byFrom.get("Nestegg/Accounts/Cash Main/Cash Main.md")!;
		expect(note.toPath).toBe("Nestegg/Accounts/Wallet/Wallet.md");
		expect(parseProps(note.content).name).toBe("Wallet");

		const oct = byFrom.get("Nestegg/Accounts/Cash Main/Transactions/2026-10.md")!;
		expect(oct.toPath).toBe("Nestegg/Accounts/Wallet/Transactions/2026-10.md");
		expect(parseProps(oct.content).account).toBe("Wallet");
		expect(byFrom.get("Nestegg/Accounts/Cash Main/Transactions/2026-09.md")!.toPath).toBe("Nestegg/Accounts/Wallet/Transactions/2026-09.md");

		const savings = byFrom.get("Nestegg/Accounts/Savings/Transactions/2026-10.md")!;
		expect(savings.toPath).toBe(savings.fromPath);
		expect(savings.content).toContain("| Wallet |");
		expect(savings.content).not.toContain("| Cash Main |");

		const settings = byFrom.get("Nestegg/Settings.md")!;
		expect(parseProps(settings.content).defaultAccount).toBe("Wallet");
		expect(changes).toHaveLength(5);
	});

	it("leaves the settings alone when the default is another account", async () => {
		const { changes } = await planAccountRename(ctx, "Savings", "Nest");
		expect(changes.some((c) => c.fromPath === "Nestegg/Settings.md")).toBe(false);
		expect(changes.find((c) => c.fromPath.endsWith("Cash Main/Transactions/2026-10.md"))!.content).toContain("| Nest |");
		expect(changes.find((c) => c.fromPath.endsWith("Cash Main/Transactions/2026-09.md"))).toBeUndefined();
	});

	it("rejects unknown, identical, invalid and clashing names", async () => {
		await expect(planAccountRename(ctx, "Nope", "X")).rejects.toThrow(/No account/);
		await expect(planAccountRename(ctx, "Savings", "Savings")).rejects.toThrow(/same/);
		await expect(planAccountRename(ctx, "Savings", "a/b")).rejects.toThrow(/not a valid name/);
		await expect(planAccountRename(ctx, "Savings", "")).rejects.toThrow(RenameError);
		await expect(planAccountRename(ctx, "Savings", "Cash Main")).rejects.toThrow(/already exists/);
	});
});

describe("planSubcategoryRename", () => {
	it("rewrites the category row and every month that uses it", async () => {
		const { changes } = await planSubcategoryRename(ctx, "Groceries", "Supermarket");
		const paths = changes.map((c) => c.fromPath).sort();
		expect(paths).toEqual([
			"Nestegg/Accounts/Cash Main/Transactions/2026-09.md",
			"Nestegg/Accounts/Cash Main/Transactions/2026-10.md",
			"Nestegg/Categories/Food.md",
		]);
		for (const c of changes) {
			expect(c.toPath).toBe(c.fromPath);
			expect(c.content).toContain("Supermarket");
			expect(c.content).not.toContain("| Groceries |");
		}
	});

	it("rejects bad requests", async () => {
		await expect(planSubcategoryRename(ctx, "Nope", "X")).rejects.toThrow(/No subcategory/);
		await expect(planSubcategoryRename(ctx, "Groceries", "Groceries")).rejects.toThrow(/same/);
		await expect(planSubcategoryRename(ctx, "Food - Misc", "X")).rejects.toThrow(/Misc/);
		await expect(planSubcategoryRename(ctx, "Groceries", "a|b")).rejects.toThrow(/valid/);
		await expect(planSubcategoryRename(ctx, "Groceries", "Salary")).rejects.toThrow(/already exists/);
	});
});

describe("planCategoryRename", () => {
	it("renames the note, its Misc row and Misc cells, leaving other subcategories alone", async () => {
		const { changes } = await planCategoryRename(ctx, "Food", "Eats");
		const note = changes.find((c) => c.fromPath === "Nestegg/Categories/Food.md")!;
		expect(note.toPath).toBe("Nestegg/Categories/Eats.md");
		expect(parseProps(note.content).name).toBe("Eats");
		expect(note.content).toContain("| Eats - Misc |");
		expect(note.content).toContain("| Groceries |");

		const oct = changes.find((c) => c.fromPath.endsWith("Cash Main/Transactions/2026-10.md"))!;
		expect(oct.content).toContain("| Eats - Misc |");
		expect(oct.content).toContain("| Groceries |");
		expect(changes).toHaveLength(2);
	});

	it("renames only the note when the category has no Misc row", async () => {
		const inputs = vaultInputs();
		const plain = inputs.find((i) => i.path.endsWith("Subscriptions.md"))!;
		plain.content = plain.content.replace("| Subscriptions - Misc |\n", "");
		const files = new Map(inputs.map((i) => [i.path, i.content]));
		const local = { snapshot: buildSnapshot(inputs), read: async (p: string) => files.get(p)! };
		const { changes } = await planCategoryRename(local, "Subscriptions", "Charges");
		expect(changes).toHaveLength(1);
		expect(changes[0].toPath).toBe("Nestegg/Categories/Charges.md");
	});

	it("rejects bad requests", async () => {
		await expect(planCategoryRename(ctx, "Nope", "X")).rejects.toThrow(/No category/);
		await expect(planCategoryRename(ctx, "Food", "Food")).rejects.toThrow(/same/);
		await expect(planCategoryRename(ctx, "Food", "a/b")).rejects.toThrow(/valid/);
		await expect(planCategoryRename(ctx, "Food", "Housing")).rejects.toThrow(/category named/);
	});

	it("rejects a rename whose Misc name is already taken by a subcategory", async () => {
		const clash = { ...ctx, snapshot: buildSnapshot(vaultInputs()) };
		clash.snapshot.categories.find((c) => c.category.name === "Housing")!.category.subcategories.push("Eats - Misc");
		await expect(planCategoryRename(clash, "Food", "Eats")).rejects.toThrow(/Eats - Misc/);
	});
});
