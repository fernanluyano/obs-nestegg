import { describe, expect, it } from "vitest";
import type { Account } from "../../domain/types";
import { accountProps, buildAccountNote, parseAccountProps } from "../../notes/accountNote";
import { parseProps } from "../../notes/frontmatter";

const cash: Account = {
	name: "Cash Main", accountType: "cash", active: true, includeInNetAsset: true,
	enteredBalanceCents: 200000, enteredBalanceAsOf: "2026-10-02", balanceCents: 200000, availableCents: 150000, color: "#1d9e75",
};

describe("availableCents", () => {
	it("is written next to balanceCents and read back", () => {
		const text = buildAccountNote(cash);
		expect(text).toContain("balanceCents: 200000\navailableCents: 150000\n");
		expect(parseAccountProps(parseProps(text))).toEqual({ ok: true, account: cash });
	});

	it("keeps a zero, which is not the same as absent", () => {
		const zero = { ...cash, availableCents: 0 };
		expect(parseAccountProps(parseProps(buildAccountNote(zero)))).toEqual({ ok: true, account: zero });
	});

	it("is absent from a note that never had it", () => {
		const { availableCents: _, ...old } = cash;
		const parsed = parseAccountProps(parseProps(buildAccountNote(old)));
		expect(parsed).toEqual({ ok: true, account: old });
		expect(buildAccountNote(old)).not.toContain("availableCents");
	});

	it("belongs to cash accounts only", () => {
		const card: Account = { ...cash, accountType: "creditCard", enteredBalanceCents: -500, balanceCents: -500 };
		expect(accountProps(card).availableCents).toBeUndefined();
		const props = { ...parseProps(buildAccountNote({ ...card, availableCents: undefined })), availableCents: 5 };
		expect(parseAccountProps(props)).toMatchObject({ ok: true, account: { accountType: "creditCard" } });
		expect((parseAccountProps(props) as { account: Account }).account.availableCents).toBeUndefined();
	});
});
