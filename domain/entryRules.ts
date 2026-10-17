import type { CategoryIndex } from "./categories";
import { isIsoDate } from "./dates";
import { isLiability, isTransferLike, type Account, type LedgerEntry, type TransactionType } from "./types";
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
	| "fromMustBeCash"
	| "transferToLoan"
	| "debtToNonLoan"
	| "wrongDebtAccount"
	| "loanTransfersOnly"
	| "investingNoTransactions"
	| "unexpectedFromTo"
	| "invalidInterest"
	| "interestOnNonLoan";

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

// A plain row: expense or income, signed amount, no FromTo.
export function entryProblem(entry: LedgerEntry, ctx: RuleContext): EntryProblem | null {
	const basic = dateAndAmount(entry.date, entry.amountCents);
	if (basic) return basic;
	const owner = accountType(ctx, entry.account);
	if (!owner) return "unknownAccount";
	const type: TransactionType | undefined = ctx.index.typeOf(entry.subcategory);
	if (!type) return "unknownSubcategory";
	if (isTransferLike(type)) return "subcategoryIsTransfer";
	if (owner === "loan") return "loanTransfersOnly";
	if (owner === "investing") return "investingNoTransactions";
	if (entry.fromTo !== "") return "unexpectedFromTo";
	return null;
}

// A transfer or a debt payment: positive cents leave `from` and arrive in `to`. Money only leaves
// a cash account. A transfer goes to another cash account or pays a credit card; a debt payment
// pays a loan, the one its subcategory is linked to when it is linked to any, so a debt only goes down.
export function transferProblem(input: TransferInput, ctx: RuleContext): EntryProblem | null {
	const basic = dateAndAmount(input.date, input.cents);
	if (basic) return basic;
	if (input.cents <= 0) return "amountNotPositive";
	const interest = input.interestCents ?? 0;
	if (!Number.isSafeInteger(interest) || interest < 0) return "invalidInterest";
	const from = accountType(ctx, input.from);
	const to = accountType(ctx, input.to);
	if (!from || !to) return "unknownAccount";
	const type = ctx.index.typeOf(input.subcategory);
	if (!type) return "unknownSubcategory";
	if (!isTransferLike(type)) return "subcategoryNotTransfer";
	if (from === "investing" || to === "investing") return "investingNoTransactions";
	if (isLiability(from)) return "fromMustBeCash";
	if (type === "transfer") {
		if (to === "loan") return "transferToLoan";
		if (interest > 0) return "interestOnNonLoan";
	} else {
		if (to !== "loan") return "debtToNonLoan";
		const linked = ctx.accounts.find((a) => a.paymentSubcategory === input.subcategory);
		if (linked && linked.name !== input.to) return "wrongDebtAccount";
	}
	if (input.from === input.to) return "sameAccount";
	return null;
}
