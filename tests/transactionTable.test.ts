import { describe, expect, it } from "vitest";
import { buildMonthContent, formatRow, parseMonthFile, parseRow, summarize } from "../transactionTable";
import type { Transaction } from "../types";

const expense: Transaction = {
	date: "04/03",
	type: "expense",
	wallet: "Checking",
	category: "food",
	note: "Lunch",
	tags: ["work", "team"],
	amountCents: 1250,
	createdAt: "2026-04-03T12:00:00.000Z",
};

const transfer: Transaction = {
	date: "04/05",
	type: "transfer",
	fromWallet: "Checking",
	toWallet: "Visa",
	category: "credit_card_payment",
	note: "",
	amountCents: 50000,
};

describe("row format", () => {
	it("round-trips a full row", () => {
		expect(parseRow(formatRow(expense))).toEqual({ ...expense, fromWallet: undefined, toWallet: undefined });
	});

	it("round-trips a transfer with empty fields as dashes", () => {
		const line = formatRow(transfer);
		expect(line).toBe("| 04/05 | transfer | - | Checking | Visa | credit_card_payment | - | - | 50000 | - |");
		expect(parseRow(line)).toEqual({
			...transfer,
			wallet: undefined,
			tags: undefined,
			createdAt: undefined,
		});
	});

	it("keeps refunds as negative amounts", () => {
		const refund = { ...expense, amountCents: -1250 };
		expect(formatRow(refund)).toContain("| -1250 |");
		expect(parseRow(formatRow(refund))?.amountCents).toBe(-1250);
	});

	it("rejects rows with a bad amount, type, or column count", () => {
		expect(parseRow("| 04/03 | expense | A | - | - | food | x | - | 12.50 | - |")).toBeNull();
		expect(parseRow("| 04/03 | payment | A | - | - | food | x | - | 100 | - |")).toBeNull();
		expect(parseRow("| 04/03 | expense | A | - | - | food | x | 100 |")).toBeNull();
	});
});

describe("month file", () => {
	it("round-trips through buildMonthContent and parseMonthFile", () => {
		const content = buildMonthContent("2026-04", [expense, transfer]);
		expect(parseMonthFile(content)).toHaveLength(2);
		expect(parseMonthFile(content)[0].amountCents).toBe(1250);
	});

	it("writes frontmatter totals in cents", () => {
		const income: Transaction = { ...expense, type: "income", amountCents: 300000 };
		const content = buildMonthContent("2026-04", [expense, income, transfer]);
		expect(content.startsWith("---\nincomeCents: 300000\nexpenseCents: 1250\n---\n")).toBe(true);
	});

	it("stops at the first blank line after the table", () => {
		const content = `${buildMonthContent("2026-04", [expense])}\n| 04/09 | expense | A | - | - | food | stray | - | 100 | - |\n`;
		expect(parseMonthFile(content)).toHaveLength(1);
	});

	it("parses an empty month", () => {
		expect(parseMonthFile(buildMonthContent("2026-04", []))).toEqual([]);
	});
});

describe("summarize", () => {
	it("excludes transfers", () => {
		expect(summarize([expense, transfer, { ...expense, type: "income", amountCents: 100 }])).toEqual({
			incomeCents: 100,
			expenseCents: 1250,
		});
	});
});
