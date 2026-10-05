import { describe, expect, it } from "vitest";
import { applyFix } from "../../services/fixes";
import { describeIssue } from "../../validation/describe";
import { buildAccountNote } from "../../notes/accountNote";
import { markInTransit } from "../../notes/transit";
import { monthPath } from "../../notes/paths";
import { account, monthInput, tx } from "../helpers/fixtures";
import { loadedLedger, TODAY } from "../helpers/ledgerFixture";

describe("applyFix", () => {
	it("clears every fixable issue by running the fix the describer offers", async () => {
		const { ledger, vault } = await loadedLedger();
		vault.files.set(monthPath("Cash Main", "2026-10"), monthInput("Cash Main", "2026-10", [tx()]).content.replace("expenseCents: 8450", "expenseCents: 1"));
		vault.files.set(monthPath("Ghost", "2026-10"), monthInput("Ghost", "2026-10", [tx()]).content);
		vault.files.set("Nestegg/Accounts/Savings/Savings.md", buildAccountNote(account({ name: "Savings", balanceCents: 1 })));
		await ledger.settings.update({ defaultAccount: "Gone" });

		const issues = await ledger.validation.validate();
		expect(issues.length).toBeGreaterThanOrEqual(4);
		for (const issue of issues) {
			const view = describeIssue(issue);
			if (view.auto) await applyFix(ledger, view.fixes[0].action, TODAY);
		}
		expect(await ledger.validation.validate()).toEqual([]);
	});

	it("dispatches promote, discard and move", async () => {
		const { ledger, vault } = await loadedLedger();
		vault.files.set("Nestegg/Categories/Lifestyle (in transit).md", markInTransit(vault.files.get("Nestegg/Categories/Lifestyle.md")!, "Nestegg/Categories/Lifestyle.md"));
		await applyFix(ledger, { kind: "promoteInTransit", path: "Nestegg/Categories/Lifestyle (in transit).md" }, TODAY);
		expect(vault.exists("Nestegg/Categories/Lifestyle (in transit).md")).toBe(false);

		vault.files.set("Nestegg/Categories/Subscriptions (in transit).md", "---\nstate: in_transit\n---\n");
		await applyFix(ledger, { kind: "discardInTransit", path: "Nestegg/Categories/Subscriptions (in transit).md" }, TODAY);
		expect(vault.exists("Nestegg/Categories/Subscriptions (in transit).md")).toBe(false);

		vault.files.set("Stray/Pets.md", vault.files.get("Nestegg/Categories/Medical.md")!.replace("Medical", "Pets"));
		await applyFix(ledger, { kind: "moveToExpectedPath", path: "Stray/Pets.md", expectedPath: "Nestegg/Categories/Pets.md" }, TODAY);
		expect(vault.exists("Nestegg/Categories/Pets.md")).toBe(true);
	});
});
