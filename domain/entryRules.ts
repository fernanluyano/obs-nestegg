import type { CategoryIndex } from "./categories";
import { isIsoDate } from "./dates";
import { CREDIT_CARD_PAYMENT } from "./defaults";
import type { Account, LedgerEntry, TransactionType } from "./types";
import type { TransferInput } from "./transactions";

export type EntryProblem =
	| "invalidDate"
	| "invalidAmount"
	| "amountNotPositive"
	| "unknownAccount"
	| "unknownSubcategory"
	| "subcategoryIsTransfer"
	| "subcategoryNotTransfer"
	| "sameAccount"
	| "fromMustNotBeCreditCard"
	| "toMustBeCreditCard"
	| "unexpectedFromTo";

export interface RuleContext {
	accounts: Account[];
	index: CategoryIndex;
}

const accountType = (ctx: RuleContext, name: string) => ctx.accounts.find((a) => a.name === name)?.accountType;

function dateAndAmount(date: string, cents: number): EntryProblem | null {
	if (!isIsoDate(date)) return "invalidDate";
	if (!Number.isSafeInteger(cents)) return "invalidAmount";
	return null;
}

// A plain (non-transfer) row: expense or income, signed amount, no FromTo.
export function entryProblem(entry: LedgerEntry, ctx: RuleContext): EntryProblem | null {
	const basic = dateAndAmount(entry.date, entry.amountCents);
	if (basic) return basic;
	if (!accountType(ctx, entry.account)) return "unknownAccount";
	const type: TransactionType | undefined = ctx.index.typeOf(entry.subcategory);
	if (!type) return "unknownSubcategory";
	if (type === "transfer") return "subcategoryIsTransfer";
	if (entry.fromTo !== "") return "unexpectedFromTo";
	return null;
}

// A transfer: positive cents leave `from` and arrive in `to`. Credit card payments go from a
// non-card account to a card, so the card's debt can only go down.
export function transferProblem(input: TransferInput, ctx: RuleContext): EntryProblem | null {
	const basic = dateAndAmount(input.date, input.cents);
	if (basic) return basic;
	if (input.cents <= 0) return "amountNotPositive";
	if (!accountType(ctx, input.from) || !accountType(ctx, input.to)) return "unknownAccount";
	const type = ctx.index.typeOf(input.subcategory);
	if (!type) return "unknownSubcategory";
	if (type !== "transfer") return "subcategoryNotTransfer";
	if (input.subcategory === CREDIT_CARD_PAYMENT) {
		if (accountType(ctx, input.from) === "creditCard") return "fromMustNotBeCreditCard";
		if (accountType(ctx, input.to) !== "creditCard") return "toMustBeCreditCard";
	}
	if (input.from === input.to) return "sameAccount";
	return null;
}
