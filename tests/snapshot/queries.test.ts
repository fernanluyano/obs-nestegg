import { describe, expect, it } from "vitest";
import {
	accountColors, accountBalances, accountHasTransactions, accountsOf, activeAccounts, cashOnHandTimeline, cashStartMonth, creditCardDebts,
	findAccount, groupByCategory, groupBySubcategory, groupByTags, knownMerchants, knownTags, loanDebts, monthEntries, monthSummaries,
	monthSummary, plannedByTags, netAsset, netAssetTimeline, netWorthStartMonth, netWorthTimeline, subcategoryUsage, suggestedTags,
} from "../../snapshot/queries";
import { buildSnapshot, categoryIndexOf, emptySnapshot } from "../../snapshot/snapshot";
import { account, asset, assetInput, monthInput, tx, valuation, vaultInputs } from "../helpers/fixtures";

const card = account({ name: "Card", accountType: "creditCard", enteredBalanceCents: -5000, enteredBalanceAsOf: "2026-09-30", balanceCents: -5000 });
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
	it("recomputes each balance from its rows, with cards as negative debt", () => {
		const b = new Map(accountBalances(snap).map((x) => [x.account.name, x.balanceCents]));
		expect(b.get("Cash Main")).toBe(200000 - 8450 + 250000 + 1200);
		expect(b.get("Card")).toBe(-5000 - 2000);
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

describe("netWorthTimeline", () => {
	const months = ["2026-09", "2026-10"];
	const withAssets = (...records: ReturnType<typeof assetInput>[]) =>
		buildSnapshot([
			...vaultInputs({
				accounts: [account({ enteredBalanceAsOf: "2026-09-30" }), card, savings],
				months: [monthInput("Cash Main", "2026-10", [tx({ amountCents: -8450 })]), monthInput("Card", "2026-10", [tx({ amountCents: -2000 })])],
			}),
			...records,
		]);

	it("splits accounts into assets and liabilities, with no asset notes", () => {
		const timeline = netWorthTimeline(withAssets(), months);
		expect(timeline.get("2026-09")).toEqual({ assetsCents: 200000, liabilitiesCents: 5000, netCents: 195000 });
		expect(timeline.get("2026-10")).toEqual({ assetsCents: 200000 - 8450, liabilitiesCents: 7000, netCents: 200000 - 8450 - 7000 });
	});

	it("adds the active asset notes to assets, zero before their first valuation", () => {
		const home = assetInput(asset(), [valuation({ date: "2026-10-01", valueCents: 1000000 })]);
		const timeline = netWorthTimeline(withAssets(home), months);
		expect(timeline.get("2026-09")?.assetsCents).toBe(200000);
		expect(timeline.get("2026-10")).toEqual({
			assetsCents: 200000 - 8450 + 1000000,
			liabilitiesCents: 7000,
			netCents: 200000 - 8450 + 1000000 - 7000,
		});
	});

	it("leaves archived assets out of every month", () => {
		const sold = assetInput(asset({ name: "Sold", active: false }), [valuation({ date: "2026-01-01", valueCents: 999 })]);
		expect(netWorthTimeline(withAssets(sold), months).get("2026-09")?.assetsCents).toBe(200000);
	});

	it("equals the net asset timeline plus the asset notes, so a card in credit is not clamped", () => {
		const credit = account({ name: "Card", accountType: "creditCard", enteredBalanceCents: 3000, enteredBalanceAsOf: "2026-09-30", balanceCents: 3000 });
		const home = assetInput(asset(), [valuation({ date: "2026-09-01", valueCents: 500 })]);
		const s = buildSnapshot([...vaultInputs({ accounts: [account({ enteredBalanceAsOf: "2026-09-30" }), credit] }), home]);
		const point = netWorthTimeline(s, ["2026-09"]).get("2026-09")!;
		expect(point.liabilitiesCents).toBe(-3000);
		expect(point.netCents).toBe(netAssetTimeline(s, ["2026-09"]).get("2026-09")! + 500);
	});

	it("ignores accounts excluded from net assets", () => {
		expect(netWorthTimeline(withAssets(), ["2026-10"]).get("2026-10")?.assetsCents).toBe(200000 - 8450);
	});
});

describe("cashOnHandTimeline", () => {
	it("sums the counted cash accounts at each month end, without debt, assets or excluded accounts", () => {
		const home = assetInput(asset(), [valuation({ date: "2026-09-01", valueCents: 999999 })]);
		const s = buildSnapshot([
			...vaultInputs({
				accounts: [account({ enteredBalanceAsOf: "2026-09-30" }), card, savings],
				months: [monthInput("Cash Main", "2026-10", [tx({ amountCents: -8450 })])],
			}),
			home,
		]);
		const timeline = cashOnHandTimeline(s, ["2026-09", "2026-10"]);
		expect(timeline.get("2026-09")).toBe(200000);
		expect(timeline.get("2026-10")).toBe(200000 - 8450);
	});
});

describe("cashStartMonth", () => {
	it("is the earliest checkpoint or transaction of a counted cash account", () => {
		const s = buildSnapshot(vaultInputs({
			accounts: [account({ enteredBalanceAsOf: "2026-09-30" }), card],
			months: [monthInput("Cash Main", "2026-07", [tx({ date: "2026-07-04" })])],
		}));
		expect(cashStartMonth(s)).toBe("2026-07");
	});

	it("ignores debt accounts and is null without a cash account", () => {
		const onlyCard = account({ name: "Card", accountType: "creditCard", enteredBalanceAsOf: "2019-01-01", enteredBalanceCents: -1, balanceCents: -1 });
		expect(cashStartMonth(buildSnapshot(vaultInputs({ accounts: [onlyCard], months: [] })))).toBeNull();
		expect(cashStartMonth(emptySnapshot())).toBeNull();
	});
});

describe("netWorthStartMonth", () => {
	it("is the earliest account checkpoint, transaction or active asset valuation", () => {
		const home = assetInput(asset(), [valuation({ date: "2025-03-10", valueCents: 1 })]);
		expect(netWorthStartMonth(snap)).toBe("2026-09");
		expect(netWorthStartMonth(buildSnapshot([...vaultInputs({ accounts: [account({ enteredBalanceAsOf: "2026-09-30" })] }), home]))).toBe("2025-03");
	});

	it("ignores archived assets and accounts excluded from net assets", () => {
		const sold = assetInput(asset({ name: "Sold", active: false }), [valuation({ date: "2020-01-01", valueCents: 1 })]);
		const old = account({ name: "Old", active: false, includeInNetAsset: false, enteredBalanceAsOf: "2019-01-01" });
		const s = buildSnapshot([...vaultInputs({ accounts: [account({ enteredBalanceAsOf: "2026-09-30" }), old] }), sold]);
		expect(netWorthStartMonth(s)).toBe("2026-09");
	});

	it("is null when nothing was entered", () => {
		expect(netWorthStartMonth(emptySnapshot())).toBeNull();
	});
});

describe("loanDebts", () => {
	const loanSnap = buildSnapshot(
		vaultInputs({
			accounts: [
				card,
				account({ name: "Car", accountType: "loan", loanKind: "car", enteredBalanceCents: -1000000, enteredBalanceAsOf: "2026-09-30", balanceCents: -1000000 }),
				account({ name: "Old loan", accountType: "loan", loanKind: "other", active: false, enteredBalanceCents: -5000, enteredBalanceAsOf: "2026-09-30", balanceCents: -5000 }),
			],
			months: [monthInput("Car", "2026-10", [tx({ subcategory: "Salary", amountCents: 100000, date: "2026-10-05" })])],
		}),
	);

	it("lists active loans only, with what is owed after payments", () => {
		const debts = loanDebts(loanSnap, "2026-10-10");
		expect(debts.map((d) => d.account.name)).toEqual(["Car"]);
		expect(debts[0].owedCents).toBe(900000);
	});
});

describe("creditCardDebts", () => {
	const cardSnap = buildSnapshot(
		vaultInputs({
			accounts: [
				card,
				account({ name: "Old card", accountType: "creditCard", active: false, enteredBalanceCents: -900, enteredBalanceAsOf: "2026-09-30", balanceCents: -900 }),
				account({ name: "In credit", accountType: "creditCard", enteredBalanceCents: 700, enteredBalanceAsOf: "2026-09-30", balanceCents: 700 }),
				account({ name: "Car", accountType: "loan", loanKind: "car", enteredBalanceCents: -1000000, enteredBalanceAsOf: "2026-09-30", balanceCents: -1000000 }),
				account({ name: "Cash", enteredBalanceAsOf: "2026-09-30" }),
			],
			months: [monthInput("Card", "2026-10", [tx({ amountCents: -2500, date: "2026-10-05" })])],
		}),
	);

	it("lists the active credit cards only, with what each owes after its rows", () => {
		expect(creditCardDebts(cardSnap).map((d) => [d.account.name, d.owedCents])).toEqual([["Card", 7500], ["In credit", 0]]);
	});

	it("is empty without credit cards", () => {
		expect(creditCardDebts(buildSnapshot(vaultInputs()))).toEqual([]);
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

	it("groups the expenses of one category by subcategory", () => {
		const entries = monthEntries(snap, "2026-10");
		const totals = groupBySubcategory(entries, index, "Food");
		expect(totals.get("Restaurants")).toBe(2000);
		expect([...totals.values()].reduce((sum, v) => sum + v, 0)).toBe(8450 - 1200 + 2000);
		expect(groupBySubcategory(entries, index, "Income").size).toBe(0);
		expect(groupBySubcategory(entries, index, "Nope").size).toBe(0);
	});

	it("groups spending by the chosen tags, a row under each tag it carries", () => {
		const base = monthEntries(snap, "2026-10")[0];
		const entries = [
			{ ...base, subcategory: "Groceries", amountCents: -1000, tags: ["need"] },
			{ ...base, subcategory: "Groceries", amountCents: -500, tags: ["need", "want"] },
			{ ...base, subcategory: "Groceries", amountCents: -300, tags: ["other"] },
			{ ...base, subcategory: "Salary", amountCents: 9000, tags: ["need"] },
		];
		expect([...groupByTags(entries, index, ["need", "want"])]).toEqual([["need", 1500], ["want", 500]]);
		expect(groupByTags(entries, index, []).size).toBe(0);
	});

	it("plans a tag as the plans of the distinct subcategories it was spent in", () => {
		const base = monthEntries(snap, "2026-10")[0];
		const entries = [
			{ ...base, subcategory: "Groceries", amountCents: -1000, tags: ["need", "want"] },
			{ ...base, subcategory: "Groceries", amountCents: -500, tags: ["need"] },
			{ ...base, subcategory: "Restaurants", amountCents: -300, tags: ["want"] },
			{ ...base, subcategory: "Salary", amountCents: 9000, tags: ["need"] },
		];
		const planned = new Map([["Groceries", 40000], ["Restaurants", 10000], ["Salary", 300000]]);
		expect([...plannedByTags(entries, index, ["need", "want", "none"], planned)]).toEqual([["need", 40000], ["want", 50000]]);
		expect(plannedByTags(entries, index, ["want"], new Map()).get("want")).toBe(0);
	});

	it("counts a debt payment under its category as spending, once", () => {
		const base = { ...monthEntries(snap, "2026-10")[0], subcategory: "Loan payment", fromTo: "House" };
		const out = { ...base, account: "Cash Main", amountCents: -185453 };
		const landing = { ...base, account: "House", amountCents: 185453, fromTo: "Cash Main" };
		expect([...groupByCategory([out, landing], index, "expense")]).toEqual([["Transfers", 185453]]);
		expect(groupByCategory([out, landing], index, "income").size).toBe(0);
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
