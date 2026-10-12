import { describe, expect, it } from "vitest";
import {
	ASSET_TYPES, assetNameProblem, latestValuation, sortValuations, valuationProblem, valueAt,
} from "../../domain/assets";
import { asset, valuation } from "../helpers/fixtures";

const history = [
	valuation({ date: "2024-03-10", valueCents: 49000000 }),
	valuation({ date: "2022-09-01", valueCents: 45000000 }),
	valuation({ date: "2026-06-15", valueCents: 52000000 }),
];

describe("asset types", () => {
	it("are a fixed list", () => {
		expect(ASSET_TYPES).toEqual(["house", "vehicle", "metal", "other"]);
	});
});

describe("valuationProblem", () => {
	it("accepts a real date and a whole number of cents, zero included", () => {
		expect(valuationProblem({ date: "2026-10-04", valueCents: 0 })).toBeNull();
		expect(valuationProblem({ date: "2026-10-04", valueCents: 123456 })).toBeNull();
	});

	it("rejects a bad date and a bad value", () => {
		expect(valuationProblem({ date: "2026-02-30", valueCents: 1 })).toBe("invalidDate");
		expect(valuationProblem({ date: "nope", valueCents: 1 })).toBe("invalidDate");
		expect(valuationProblem({ date: "2026-10-04", valueCents: -1 })).toBe("invalidValue");
		expect(valuationProblem({ date: "2026-10-04", valueCents: 1.5 })).toBe("invalidValue");
		expect(valuationProblem({ date: "2026-10-04", valueCents: Number.NaN })).toBe("invalidValue");
	});
});

describe("sortValuations", () => {
	it("orders by date without touching the input", () => {
		const input = [...history];
		expect(sortValuations(input).map((v) => v.date)).toEqual(["2022-09-01", "2024-03-10", "2026-06-15"]);
		expect(input).toEqual(history);
	});

	it("keeps equal dates as they were", () => {
		const a = valuation({ date: "2026-01-01", note: "a" });
		const b = valuation({ date: "2026-01-01", note: "b" });
		expect(sortValuations([a, b])).toEqual([a, b]);
	});
});

describe("latestValuation", () => {
	it("is the row with the latest date wherever it sits", () => {
		expect(latestValuation(history)?.valueCents).toBe(52000000);
	});

	it("is null without rows", () => {
		expect(latestValuation([])).toBeNull();
	});
});

describe("valueAt", () => {
	it("is the latest row on or before the date", () => {
		expect(valueAt(history, "2024-03-10")).toBe(49000000);
		expect(valueAt(history, "2025-12-31")).toBe(49000000);
		expect(valueAt(history, "2026-06-14")).toBe(49000000);
		expect(valueAt(history, "2030-01-01")).toBe(52000000);
	});

	it("is zero before the first row and without rows", () => {
		expect(valueAt(history, "2022-08-31")).toBe(0);
		expect(valueAt([], "2026-01-01")).toBe(0);
	});
});

describe("assetNameProblem", () => {
	const assets = [asset({ name: "House" }), asset({ name: "Gold" })];

	it("reports empty, invalid and taken names", () => {
		expect(assetNameProblem(assets, "")).toBe("empty");
		expect(assetNameProblem(assets, "a/b")).toBe("invalid");
		expect(assetNameProblem(assets, "House")).toBe("duplicate");
	});

	it("accepts a free name, and a name an asset already has when it is the one being renamed", () => {
		expect(assetNameProblem(assets, "Car")).toBeNull();
		expect(assetNameProblem(assets, "House", "House")).toBeNull();
		expect(assetNameProblem(assets, "Gold", "House")).toBe("duplicate");
	});
});
