import { describe, expect, it } from "vitest";
import {
	accountColors, accountBalances, accountHasTransactions, accountsOf, activeAccounts,
	findAccount, groupByCategory, knownMerchants, knownTags, monthEntries, monthSummaries,
	monthSummary, netAsset, netAssetTimeline, subcategoryUsage, suggestedTags,
} from "../../snapshot/queries";
import { buildSnapshot, categoryIndexOf } from "../../snapshot/snapshot";
import { account, monthInput, tx, vaultInputs } from "../helpers/fixtures";

const card = account({ name: "Card", accountType: "creditCard", enteredBalanceCents: 5000, enteredBalanceAsOf: "2026-09-30", balanceCents: 5000 });
const savings = account({ name: "Savings", active: false, includeInNetAsset: false, enteredBalanceCents: 99999 });

const snap = buildSnapshot(
	vaultInputs({
		accounts: [account({ enteredBalanceAsOf: "2026-09-30" }), card, savings],
		months: [
			monthInput("Cash Main", "2026-09", [tx({ date: "2026-09-10", amountCents: -1000, tags: ["old"], merchant: "Shell" })]),
			monthInput("Cash Main", "2026-10", [
				tx({ amountCents: -8450, tags: ["weekly", "gift"] }),
				tx({ subcategory: "Salary", amountCents: 250000, merchant: "Employer", date: "2026-10-05" }),
				tx({ amountCents: 1200, date: "2026-10-06" }),
			]),
			monthInput("Card", "2026-10", [tx({ amountCents: -2000, merchant: "Diner", subcategory: "Restaurants", date: "2026-10-07" })]),
			monthInput("Cash Main", "2026-11", []),
		],
	}),
);
const index = categoryIndexOf(snap);

describe("account lookups", () => {
	it("lists, filters and finds accounts", () => {
		expect(accountsOf(snap).map((a) => a.name)).toEqual(["Card", "Cash Main", "Savings"]);
		expect(activeAccounts(snap).map((a) => a.name)).toEqual(["Card", "Cash Main"]);
		expect(findAccount(snap, "Card")?.accountType).toBe("creditCard");
		expect(findAccount(snap, "Nope")).toBeUndefined();
	});

	it("knows which accounts have transactions", () => {
		expect(accountHasTransactions(snap, "Cash Main")).toBe(true);
		expect(accountHasTransactions(snap, "Savings")).toBe(false);
	});
});

describe("balances", () => {
	it("recomputes each balance from its rows, with cards as debt", () => {
		const b = new Map(accountBalances(snap).map((x) => [x.account.name, x.balanceCents]));
		expect(b.get("Cash Main")).toBe(200000 - 8450 + 250000 + 1200);
		expect(b.get("Card")).toBe(5000 + 2000);
		expect(b.get("Savings")).toBe(99999);
	});

	it("computes net asset over the accounts that count", () => {
		expect(netAsset(snap)).toBe(200000 - 8450 + 250000 + 1200 - 7000);
	});

	it("builds the net asset timeline at each month end", () => {
		const timeline = netAssetTimeline(snap, ["2026-09", "2026-10", "2026-11"]);
		expect(timeline.get("2026-09")).toBe(200000 - 5000);
		expect(timeline.get("2026-10")).toBe(200000 - 8450 + 250000 + 1200 - 7000);
		expect(timeline.get("2026-11")).toBe(timeline.get("2026-10"));
	});
});

describe("month queries", () => {
	it("lists the entries of a month across accounts, tagged with their account", () => {
		const entries = monthEntries(snap, "2026-10");
		expect(entries).toHaveLength(4);
		expect(entries.filter((e) => e.account === "Card")).toHaveLength(1);
		expect(monthEntries(snap, "2025-01")).toEqual([]);
	});

	it("summarizes a month across accounts, netting refunds", () => {
		expect(monthSummary(snap, "2026-10")).toEqual({ incomeCents: 250000, expenseCents: 8450 - 1200 + 2000 });
		expect(monthSummary(snap, "2026-10", index)).toEqual(monthSummary(snap, "2026-10"));
	});

	it("summarizes many months, empty ones as zero", () => {
		const s = monthSummaries(snap, ["2026-09", "2026-11", "2020-01"]);
		expect(s.get("2026-09")).toEqual({ incomeCents: 0, expenseCents: 1000 });
		expect(s.get("2026-11")).toEqual({ incomeCents: 0, expenseCents: 0 });
		expect(s.get("2020-01")).toEqual({ incomeCents: 0, expenseCents: 0 });
	});

	it("groups entries by category for a type", () => {
		const entries = monthEntries(snap, "2026-10");
		expect([...groupByCategory(entries, index, "expense")]).toEqual([["Food", 8450 - 1200 + 2000]]);
		expect([...groupByCategory(entries, index, "income")]).toEqual([["Income", 250000]]);
		expect(groupByCategory([{ ...entries[0], subcategory: "Nope" }], index, "expense").size).toBe(0);
	});
});

describe("known values", () => {
	it("scans distinct tags and merchants from the files", () => {
		expect(knownTags(snap)).toEqual(["gift", "old", "weekly"]);
		expect(knownMerchants(snap)).toEqual(["Diner", "Employer", "Publix", "Shell"]);
	});

	it("suggests the built-in tags first, then the tags already used", () => {
		expect(suggestedTags(snap)).toEqual(["need", "want", "gift", "old", "weekly"]);
	});

	it("does not repeat a built-in tag the user has already used", () => {
		const used = buildSnapshot(vaultInputs({ months: [monthInput("Cash Main", "2026-10", [tx({ tags: ["want", "gift"] })])] }));
		expect(suggestedTags(used)).toEqual(["need", "want", "gift"]);
	});

	it("suggests only the built-in tags when nothing has been tagged", () => {
		expect(suggestedTags(buildSnapshot([]))).toEqual(["need", "want"]);
	});

	it("counts subcategory usage", () => {
		expect(subcategoryUsage(snap, "Groceries")).toBe(3);
		expect(subcategoryUsage(snap, "Salary")).toBe(1);
		expect(subcategoryUsage(snap, "Fuel")).toBe(0);
	});
});

describe("accountColors", () => {
	it("maps every account name to its color", () => {
		const colored = buildSnapshot(vaultInputs({ accounts: [account({ color: "#111111" }), account({ name: "Other", color: "#222222" })], months: [] }));
		expect([...accountColors(colored)]).toEqual([["Cash Main", "#111111"], ["Other", "#222222"]]);
	});
});
