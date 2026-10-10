import { describe, expect, it } from "vitest";
import {
	availableOf, bucketNameProblem, bucketProgress, bucketsTotal, cachedAvailable, goalProblem, moveInProblem,
	moveOutProblem, outflowProblem, type Bucket,
} from "../../domain/buckets";

const fund: Bucket = { name: "Emergency Fund", goalCents: 1000000, balanceCents: 250000 };
const trip: Bucket = { name: "Vacation", balanceCents: 40000 };

describe("totals and available", () => {
	it("sums the buckets and subtracts them from the balance", () => {
		expect(bucketsTotal([fund, trip])).toBe(290000);
		expect(bucketsTotal([])).toBe(0);
		expect(availableOf(500000, [fund, trip])).toBe(210000);
		expect(availableOf(500000, [])).toBe(500000);
	});

	it("reads a missing cached available as the balance", () => {
		expect(cachedAvailable({ balanceCents: 900 })).toBe(900);
		expect(cachedAvailable({ balanceCents: 900, availableCents: 400 })).toBe(400);
		expect(cachedAvailable({ balanceCents: 900, availableCents: 0 })).toBe(0);
	});
});

describe("bucketProgress", () => {
	it("is null without a goal", () => {
		expect(bucketProgress(trip)).toBeNull();
	});

	it("is the share of the goal, complete past it", () => {
		expect(bucketProgress(fund)).toBe(0.25);
		expect(bucketProgress({ ...fund, balanceCents: 0 })).toBe(0);
		expect(bucketProgress({ ...fund, balanceCents: 1000000 })).toBe(1);
		expect(bucketProgress({ ...fund, balanceCents: 5000000 })).toBe(1);
	});
});

describe("bucketNameProblem", () => {
	it("accepts a fresh valid name", () => {
		expect(bucketNameProblem([fund], "Vacation")).toBeNull();
	});

	it("rejects empty and invalid names", () => {
		expect(bucketNameProblem([], " ")).toBe("empty");
		expect(bucketNameProblem([], "a|b")).toBe("invalid");
	});

	it("rejects a name already used in the account, except by the bucket being renamed", () => {
		expect(bucketNameProblem([fund, trip], "Vacation")).toBe("duplicate");
		expect(bucketNameProblem([fund, trip], "Vacation", "Vacation")).toBeNull();
		expect(bucketNameProblem([fund, trip], "Emergency Fund", "Vacation")).toBe("duplicate");
	});
});

describe("goalProblem", () => {
	it("allows no goal or a positive whole number of cents", () => {
		expect(goalProblem(undefined)).toBeNull();
		expect(goalProblem(1)).toBeNull();
	});

	it("rejects zero, negative and fractional goals", () => {
		for (const goal of [0, -5, 1.5, NaN]) expect(goalProblem(goal)).toBe("invalidGoal");
	});
});

describe("moves", () => {
	it("moves in up to what is available", () => {
		expect(moveInProblem(1000, 1000)).toBeNull();
		expect(moveInProblem(1001, 1000)).toBe("exceedsAvailable");
		expect(moveInProblem(1, -50)).toBe("exceedsAvailable");
	});

	it("moves out up to what the bucket holds", () => {
		expect(moveOutProblem(250000, fund)).toBeNull();
		expect(moveOutProblem(250001, fund)).toBe("exceedsBucket");
	});

	it("rejects amounts that are not positive whole cents", () => {
		expect(moveInProblem(0, 1000)).toBe("amountNotPositive");
		expect(moveInProblem(-5, 1000)).toBe("amountNotPositive");
		expect(moveInProblem(1.5, 1000)).toBe("invalidAmount");
		expect(moveOutProblem(0, fund)).toBe("amountNotPositive");
		expect(moveOutProblem(NaN, fund)).toBe("invalidAmount");
	});
});

describe("outflowProblem", () => {
	it("passes when available stays at zero or more", () => {
		expect(outflowProblem(500000, [fund], 250000)).toBeNull();
		expect(outflowProblem(500000, [], 500000)).toBeNull();
	});

	it("never blocks an entry that adds money or changes nothing", () => {
		expect(outflowProblem(0, [fund], 0)).toBeNull();
		expect(outflowProblem(0, [fund], -100)).toBeNull();
	});

	it("tells the user to free money from buckets when the balance alone would cover it", () => {
		expect(outflowProblem(150000, [{ ...fund, balanceCents: 50000 }], 120000)).toEqual({
			kind: "bucketsHold", availableCents: 100000, needsCents: 120000, bucketsCents: 50000,
		});
	});

	it("is plain not enough funds when the balance could not cover it either", () => {
		expect(outflowProblem(100000, [fund], 120000)).toEqual({ kind: "notEnoughFunds" });
		expect(outflowProblem(0, [], 1)).toEqual({ kind: "notEnoughFunds" });
	});

	it("rejects any outflow once available is already negative", () => {
		expect(outflowProblem(100000, [fund], 1)).toEqual({ kind: "bucketsHold", availableCents: -150000, needsCents: 1, bucketsCents: 250000 });
	});
});
