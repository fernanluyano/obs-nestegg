import { describe, expect, it } from "vitest";
import { buildBudgetNote } from "../../notes/budgetNote";
import { buildSnapshot } from "../../snapshot/snapshot";
import { validateSnapshot } from "../../validation/validate";
import { budgetInput, inputOf, vaultInputs } from "../helpers/fixtures";

const lines = [{ subcategory: "Groceries", plannedCents: 100 }];
const issuesOf = (extra: ReturnType<typeof inputOf>[]) => validateSnapshot(buildSnapshot([...vaultInputs(), ...extra]));

describe("budget notes in validation", () => {
	it("accepts a budget at its expected path", () => {
		expect(issuesOf([budgetInput("2026-10", lines)])).toEqual([]);
	});

	it("flags a budget moved away from Budgets/YYYY-MM.md", () => {
		const moved = inputOf("Elsewhere/plan.md", buildBudgetNote("2026-10", lines));
		expect(issuesOf([moved])).toEqual([
			{ type: "pathMismatch", kind: "budget", path: "Elsewhere/plan.md", expectedPath: "Nestegg/Budgets/2026-10.md" },
		]);
	});

	it("flags unreadable rows with their file and line", () => {
		const broken = inputOf("Nestegg/Budgets/2026-10.md", buildBudgetNote("2026-10", lines).replace("| 100 |", "| lots |"));
		expect(issuesOf([broken])).toMatchObject([{ type: "malformedRow", path: "Nestegg/Budgets/2026-10.md", reason: expect.stringMatching(/integer/) }]);
	});

	it("flags a budget note whose month is unreadable", () => {
		const bad = inputOf("Nestegg/Budgets/oops.md", "---\ntags: [nestegg/budget]\nstate: current\nmonth: soon\n---\n");
		expect(issuesOf([bad])).toMatchObject([{ type: "invalidNote", kind: "budget", path: "Nestegg/Budgets/oops.md" }]);
	});
});
