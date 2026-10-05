import { describe, expect, it } from "vitest";
import { DEFAULT_ACCOUNT_COLOR } from "../../domain/colors";
import type { Account } from "../../domain/types";
import { accountProps, buildAccountNote, parseAccountProps } from "../../notes/accountNote";
import { parseProps } from "../../notes/frontmatter";

const account: Account = {
	name: "Cash Main", accountType: "cash", active: true, includeInNetAsset: true,
	enteredBalanceCents: 200000, enteredBalanceAsOf: "2026-10-02", balanceCents: 213500,
	color: "#1d9e75",
};

describe("parseAccountProps", () => {
	it("reads a full account note", () => {
		expect(parseAccountProps(parseProps(buildAccountNote(account)))).toEqual({ ok: true, account });
	});

	it("applies defaults for the optional properties", () => {
		const parsed = parseAccountProps({ name: "Cash", accountType: "cash", enteredBalanceAsOf: "2026-10-02", enteredBalanceCents: 500 });
		expect(parsed).toEqual({
			ok: true,
			account: { ...account, name: "Cash", enteredBalanceCents: 500, balanceCents: 500, color: DEFAULT_ACCOUNT_COLOR },
		});
	});

	it("reads the color, lowercased, and falls back to the default for a missing or invalid one", () => {
		const base = { name: "A", accountType: "cash", enteredBalanceAsOf: "2026-10-02" };
		expect(parseAccountProps({ ...base, color: "#1D9E75" })).toMatchObject({ account: { color: "#1d9e75" } });
		for (const color of [undefined, "", "red", "#12345", "#12345g", "1d9e75"]) {
			expect(parseAccountProps({ ...base, color })).toMatchObject({ account: { color: DEFAULT_ACCOUNT_COLOR } });
		}
	});

	it("defaults the entered balance to zero", () => {
		const parsed = parseAccountProps({ name: "Cash", accountType: "cash", enteredBalanceAsOf: "2026-10-02" });
		expect(parsed).toMatchObject({ ok: true, account: { enteredBalanceCents: 0, balanceCents: 0 } });
	});

	it("always counts active accounts but lets an inactive one choose", () => {
		const base = { name: "A", accountType: "cash", enteredBalanceAsOf: "2026-10-02" };
		expect(parseAccountProps({ ...base, includeInNetAsset: false })).toMatchObject({ account: { includeInNetAsset: true } });
		expect(parseAccountProps({ ...base, active: false })).toMatchObject({ account: { active: false, includeInNetAsset: false } });
		expect(parseAccountProps({ ...base, active: false, includeInNetAsset: true })).toMatchObject({ account: { includeInNetAsset: true } });
	});

	it("rejects a missing name, a bad type and a bad date", () => {
		const base = { name: "A", accountType: "cash", enteredBalanceAsOf: "2026-10-02" };
		expect(parseAccountProps({ ...base, name: " " })).toEqual({ ok: false, reason: "missing name" });
		expect(parseAccountProps({ ...base, accountType: "bank" })).toMatchObject({ ok: false });
		expect(parseAccountProps({ ...base, accountType: undefined })).toMatchObject({ ok: false });
		expect(parseAccountProps({ ...base, enteredBalanceAsOf: "10/02" })).toMatchObject({ ok: false });
		expect(parseAccountProps({ ...base, enteredBalanceAsOf: undefined })).toMatchObject({ ok: false });
	});
});

describe("accountProps / buildAccountNote", () => {
	it("writes the marker tag, state and every property", () => {
		expect(accountProps(account)).toMatchObject({ tags: ["nestegg/account"], state: "current", name: "Cash Main" });
		expect(buildAccountNote(account)).toBe(
			[
				"---", "tags: [nestegg/account]", "state: current", "name: Cash Main", "accountType: cash", "active: true",
				"includeInNetAsset: true", "enteredBalanceCents: 200000", "enteredBalanceAsOf: 2026-10-02",
				"balanceCents: 213500", 'color: "#1d9e75"', "---", "",
			].join("\n"),
		);
	});

	it("lets extra properties override, for staging", () => {
		expect(accountProps(account, { state: "in_transit" }).state).toBe("in_transit");
	});

	it("round trips a name that looks like a number", () => {
		const numeric = { ...account, name: "2026" };
		expect(parseAccountProps(parseProps(buildAccountNote(numeric)))).toEqual({ ok: true, account: numeric });
	});
});
