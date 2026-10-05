import type { Account, AccountBalance, Transaction } from "./types";

// A credit card's balance is debt owed: spending (negative rows) raises it, payments lower it.
function applySigned(account: Account, base: number, rowsSum: number): number {
	return account.accountType === "creditCard" ? base - rowsSum : base + rowsSum;
}

function sumAmounts(transactions: Transaction[], keep: (date: string) => boolean): number {
	let sum = 0;
	for (const tx of transactions) if (keep(tx.date)) sum += tx.amountCents;
	return sum;
}

// Balance at the end of `date`, replaying forward or backward from the entered checkpoint,
// so a correction dated mid-history still yields the right balance on both sides of it.
export function balanceAt(account: Account, transactions: Transaction[], date: string): number {
	const asOf = account.enteredBalanceAsOf;
	if (date >= asOf) {
		const delta = sumAmounts(transactions, (d) => d > asOf && d <= date);
		return applySigned(account, account.enteredBalanceCents, delta);
	}
	const delta = sumAmounts(transactions, (d) => d > date && d <= asOf);
	return applySigned(account, account.enteredBalanceCents, -delta);
}

// Current balance: the entered balance plus everything dated after it, with no upper bound.
export function currentBalance(account: Account, transactions: Transaction[]): number {
	const delta = sumAmounts(transactions, (d) => d > account.enteredBalanceAsOf);
	return applySigned(account, account.enteredBalanceCents, delta);
}

export function netAssetCents(balances: AccountBalance[]): number {
	let net = 0;
	for (const { account, balanceCents } of balances) {
		if (!account.includeInNetAsset) continue;
		net += account.accountType === "creditCard" ? -balanceCents : balanceCents;
	}
	return net;
}
