import { describe, expect, it } from "vitest";
import { DEFAULT_ACCOUNT_COLOR } from "../../domain/colors";
import type { Account } from "../../domain/types";
import { accountProps, buildAccountNote, parseAccountProps, unbalancedTagPatch } from "../../notes/accountNote";
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

describe("loan accounts", () => {
	const loan: Account = {
		...account, name: "Mortgage", accountType: "loan", enteredBalanceCents: -20000000, balanceCents: -20000000,
		loanKind: "mortgage", termMonths: 360, startDate: "2024-03-01", interest: 6.25, originalCents: 25000000, paymentSubcategory: "Mortgage payment",
	};
	const base = { name: "Loan", accountType: "loan", enteredBalanceAsOf: "2026-10-02", loanKind: "car" };

	it("round trips the kind, plan fields and payment category", () => {
		expect(parseAccountProps(parseProps(buildAccountNote(loan)))).toEqual({ ok: true, account: loan });
	});

	it("reads Obsidian's already-parsed numbers the same way", () => {
		expect(parseAccountProps({ ...base, termMonths: 60, interest: 4.5 })).toMatchObject({ ok: true, account: { termMonths: 60, interest: 4.5 } });
	});

	it("loads with just a kind, leaving the plan fields unset", () => {
		const parsed = parseAccountProps(base);
		expect(parsed).toMatchObject({ ok: true, account: { loanKind: "car" } });
		if (parsed.ok) for (const key of ["termMonths", "startDate", "interest", "originalCents", "paymentSubcategory"]) expect(parsed.account).not.toHaveProperty(key);
	});

	it("round trips the extra payment and leaves zero unset", () => {
		const withExtra = { ...loan, extraPaymentCents: 15000 };
		expect(parseAccountProps(parseProps(buildAccountNote(withExtra)))).toEqual({ ok: true, account: withExtra });
		expect(buildAccountNote({ ...loan, extraPaymentCents: 0 })).not.toContain("extraPaymentCents");
		const zero = parseAccountProps({ ...base, extraPaymentCents: 0 });
		expect(zero).toMatchObject({ ok: true });
		if (zero.ok) expect(zero.account).not.toHaveProperty("extraPaymentCents");
	});

	it("is invalid with a negative or non-numeric extra payment", () => {
		expect(parseAccountProps({ ...base, extraPaymentCents: -100 })).toMatchObject({ ok: false });
		expect(parseAccountProps({ ...base, extraPaymentCents: "lots" })).toMatchObject({ ok: false });
	});

	it("treats blank plan fields as not set", () => {
		expect(parseAccountProps({ ...base, termMonths: "", startDate: "", interest: "" })).toMatchObject({ ok: true });
	});

	it("is invalid with a missing or unknown loan kind", () => {
		expect(parseAccountProps({ ...base, loanKind: undefined })).toMatchObject({ ok: false });
		expect(parseAccountProps({ ...base, loanKind: "boat" })).toMatchObject({ ok: false });
	});

	it.each([
		["termMonths", 0],
		["termMonths", -12],
		["termMonths", 12.5],
		["termMonths", "soon"],
		["startDate", "2024-13-01"],
		["startDate", "march"],
		["interest", -1],
		["interest", "6.2555"],
		["interest", "high"],
		["originalCents", 0],
		["originalCents", -100],
		["originalCents", "a lot"],
	])("is invalid with %s of %j", (key, value) => {
		expect(parseAccountProps({ ...base, [key]: value })).toMatchObject({ ok: false });
	});

	it("ignores the plan fields on cash and credit card accounts", () => {
		const plan = { loanKind: "car", termMonths: 12, startDate: "2024-01-01", interest: 5 };
		for (const accountType of ["cash", "creditCard"]) {
			const parsed = parseAccountProps({ name: "A", accountType, enteredBalanceAsOf: "2026-10-02", ...plan });
			expect(parsed).toMatchObject({ ok: true });
			if (parsed.ok) for (const key of Object.keys(plan)) expect(parsed.account).not.toHaveProperty(key);
		}
	});

	it("keeps the payment category on a credit card and drops it on cash", () => {
		const props = { name: "A", enteredBalanceAsOf: "2026-10-02", paymentSubcategory: "Credit card payment" };
		expect(parseAccountProps({ ...props, accountType: "creditCard" })).toMatchObject({ account: { paymentSubcategory: "Credit card payment" } });
		const cash = parseAccountProps({ ...props, accountType: "cash" });
		if (cash.ok) expect(cash.account).not.toHaveProperty("paymentSubcategory");
	});

	it("writes the loan properties only for a loan", () => {
		expect(buildAccountNote(loan)).toContain("loanKind: mortgage\ntermMonths: 360\nstartDate: 2024-03-01\ninterest: 6.25");
		expect(buildAccountNote(account)).not.toMatch(/loanKind|termMonths|startDate|interest|paymentSubcategory/);
	});
});

describe("unbalancedTagPatch", () => {
	const note = (tags: string) => `---\ntags: ${tags}\nname: A\n---\n`;

	it("adds the tag and keeps the user's other tags", () => {
		expect(unbalancedTagPatch(note("[nestegg/account, mine]"), true)).toEqual({ tags: ["nestegg/account", "mine", "nestegg/unbalanced"] });
	});

	it("removes the tag, including a #-prefixed one, without duplicating it", () => {
		expect(unbalancedTagPatch(note("[nestegg/account, '#nestegg/unbalanced']"), false)).toEqual({ tags: ["nestegg/account"] });
		expect(unbalancedTagPatch(note("[nestegg/account, nestegg/unbalanced]"), true)).toEqual({ tags: ["nestegg/account", "nestegg/unbalanced"] });
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

	it("writes the unbalanced property and tag only when the account is flagged, and reads it back", () => {
		expect(accountProps(account).unbalancedCents).toBeUndefined();
		const flagged = { ...account, unbalancedCents: -4210 };
		expect(accountProps(flagged)).toMatchObject({ tags: ["nestegg/account", "nestegg/unbalanced"], unbalancedCents: -4210 });
		expect(parseAccountProps(parseProps(buildAccountNote(flagged)))).toEqual({ ok: true, account: flagged });
	});

	it("round trips a name that looks like a number", () => {
		const numeric = { ...account, name: "2026" };
		expect(parseAccountProps(parseProps(buildAccountNote(numeric)))).toEqual({ ok: true, account: numeric });
	});
});
