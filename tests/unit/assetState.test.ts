import { describe, expect, it } from "vitest";
import { parseAssetEditForm, parseNewAssetForm, parseValuationForm, parseValueText } from "../../modal/assetState";
import { asset } from "../helpers/fixtures";

describe("parseValueText", () => {
	it("reads a dollar amount to cents, zero included", () => {
		expect(parseValueText("520000")).toEqual({ ok: true, cents: 52000000 });
		expect(parseValueText("1.15")).toEqual({ ok: true, cents: 115 });
		expect(parseValueText("0")).toEqual({ ok: true, cents: 0 });
	});

	it("explains a blank, unreadable or negative value", () => {
		expect(parseValueText("  ")).toEqual({ ok: false, error: "err.amountRequired" });
		expect(parseValueText("abc")).toEqual({ ok: false, error: "err.amountInvalid" });
		expect(parseValueText("1.234")).toEqual({ ok: false, error: "err.amountInvalid" });
		expect(parseValueText("-5")).toEqual({ ok: false, error: "err.assetValueNegative" });
	});
});

describe("parseValuationForm", () => {
	it("accepts a date and a value", () => {
		expect(parseValuationForm({ valueText: "10.50", date: "2026-10-04" })).toEqual({ ok: true, valueCents: 1050, date: "2026-10-04" });
	});

	it("checks the date before the value", () => {
		expect(parseValuationForm({ valueText: "abc", date: "" })).toEqual({ ok: false, error: "err.invalidDate" });
		expect(parseValuationForm({ valueText: "abc", date: "2026-10-04" })).toEqual({ ok: false, error: "err.amountInvalid" });
	});
});

describe("parseAssetEditForm", () => {
	const existing = [asset({ name: "House" }), asset({ name: "Gold" })];

	it("accepts the asset's own name and a free one", () => {
		expect(parseAssetEditForm({ name: "House" }, existing, "House")).toEqual({ ok: true, name: "House" });
		expect(parseAssetEditForm({ name: "Home" }, existing, "House")).toEqual({ ok: true, name: "Home" });
	});

	it("explains an empty, invalid or taken name", () => {
		expect(parseAssetEditForm({ name: "" }, existing, "House")).toEqual({ ok: false, error: "err.assetNameEmpty" });
		expect(parseAssetEditForm({ name: "a/b" }, existing, "House")).toEqual({ ok: false, error: "err.invalidName" });
		expect(parseAssetEditForm({ name: "Gold" }, existing, "House")).toEqual({ ok: false, error: "err.assetNameTaken" });
	});
});

describe("parseNewAssetForm", () => {
	const existing = [asset({ name: "House" })];
	const form = { name: "Gold", valueText: "1800", date: "2026-10-04" };

	it("accepts a free name with a date and a value", () => {
		expect(parseNewAssetForm(form, existing)).toEqual({ ok: true, name: "Gold", valueCents: 180000, date: "2026-10-04" });
	});

	it("explains an empty, invalid or taken name before anything else", () => {
		expect(parseNewAssetForm({ ...form, name: "" }, existing)).toEqual({ ok: false, error: "err.assetNameEmpty" });
		expect(parseNewAssetForm({ ...form, name: "a/b" }, existing)).toEqual({ ok: false, error: "err.invalidName" });
		expect(parseNewAssetForm({ ...form, name: "House", valueText: "x" }, existing)).toEqual({ ok: false, error: "err.assetNameTaken" });
	});

	it("passes on a bad date or value", () => {
		expect(parseNewAssetForm({ ...form, date: "nope" }, existing)).toEqual({ ok: false, error: "err.invalidDate" });
		expect(parseNewAssetForm({ ...form, valueText: "" }, existing)).toEqual({ ok: false, error: "err.amountRequired" });
	});
});
