import { currentBalance, loanFieldProblem } from "../domain/accounts";
import { isHexColor, nextAccountColor } from "../domain/colors";
import { isIsoDate } from "../domain/dates";
import { bucketsTotal } from "../domain/buckets";
import { nameProblem } from "../domain/names";
import { latestValuation, valuationProblem, type Valuation } from "../domain/assets";
import { isInvesting, type Account, type AccountType, type LoanKind } from "../domain/types";
import { buildAccountNote, unbalancedTagPatch } from "../notes/accountNote";
import { readValuations, removeValuationRow, upsertValuationRow } from "../notes/assetNote";
import { clearBuckets } from "../notes/bucketTable";
import { patchProps, type Props } from "../notes/frontmatter";
import { accountPath } from "../notes/paths";
import { planAccountRename } from "../rename/accountRename";
import { executePlan } from "../rename/execute";
import { accountHasTransactions, accountsOf, bucketsOf, findAccount } from "../snapshot/queries";
import { accountTransactions } from "../snapshot/snapshot";
import { cleanupEmptyFolders } from "../storage/folders";
import { LedgerError } from "./errors";
import type { LedgerStore } from "./LedgerStore";

export interface NewAccount {
	name: string;
	accountType: AccountType;
	enteredBalanceCents: number;
	enteredBalanceAsOf: string;
	color?: string; // defaults to the next palette color no account uses
	loanKind?: LoanKind; // required for a loan, refused on any other type
	termMonths?: number;
	startDate?: string;
	interest?: number;
	originalCents?: number;
	paymentSubcategory?: string; // debt accounts only
}

// The user's own settings for an account; the cached balance is derived and never passed in.
export interface AccountPatch {
	includeInNetAsset?: boolean;
	enteredBalanceCents?: number;
	enteredBalanceAsOf?: string;
	color?: string;
	// Passing the key as undefined clears the flag; leaving it out keeps it.
	unbalancedCents?: number;
	// Loan fields and the payment category follow the same rule: undefined clears, left out keeps.
	loanKind?: LoanKind;
	termMonths?: number;
	startDate?: string;
	interest?: number;
	originalCents?: number;
	extraPaymentCents?: number;
	paymentSubcategory?: string;
}

const LOAN_FIELDS = ["loanKind", "termMonths", "startDate", "interest", "originalCents", "extraPaymentCents"] as const;

export class AccountService {
	constructor(private store: LedgerStore) {}

	private require(name: string): Account {
		const account = findAccount(this.store.snapshot, name);
		if (!account) throw new LedgerError(`No account named "${name}"`);
		return account;
	}

	// Loan fields belong to loans only, a loan always has its kind, and the payment category must be
	// an existing debt payment subcategory on a loan.
	private checkDebtFields(type: AccountType, fields: Partial<Pick<Account, (typeof LOAN_FIELDS)[number] | "paymentSubcategory">>): void {
		if (type === "loan") {
			if (fields.loanKind === undefined) throw new LedgerError("A loan needs a kind");
			const problem = loanFieldProblem(fields);
			if (problem) throw new LedgerError(problem);
		} else if (LOAN_FIELDS.some((key) => fields[key] !== undefined)) {
			throw new LedgerError("Only a loan has a kind, term, start date, interest, original amount or extra payment");
		}
		if (fields.paymentSubcategory === undefined) return;
		if (type !== "loan") throw new LedgerError("Only a loan has a payment category; a credit card is paid with a transfer");
		if (this.store.index.typeOf(fields.paymentSubcategory) !== "debt") throw new LedgerError(`"${fields.paymentSubcategory}" is not a debt payment subcategory`);
	}

	async create(input: NewAccount): Promise<void> {
		const problem = nameProblem(input.name);
		if (problem) throw new LedgerError(`"${input.name}" is not a valid account name`);
		if (findAccount(this.store.snapshot, input.name)) throw new LedgerError(`An account named "${input.name}" already exists`);
		if (!isIsoDate(input.enteredBalanceAsOf)) throw new LedgerError("The balance date is not a valid date");
		if (!Number.isSafeInteger(input.enteredBalanceCents)) throw new LedgerError("The balance is not a valid amount");

		if (input.color !== undefined && !isHexColor(input.color)) throw new LedgerError("The color is not a valid #rrggbb color");
		this.checkDebtFields(input.accountType, input);
		if (isInvesting(input.accountType)) this.checkEntry({ date: input.enteredBalanceAsOf, valueCents: input.enteredBalanceCents });

		const account: Account = {
			...input,
			color: (input.color ?? nextAccountColor(accountsOf(this.store.snapshot).map((a) => a.color))).toLowerCase(),
			active: true, includeInNetAsset: true, balanceCents: input.enteredBalanceCents,
			...(input.accountType === "cash" ? { availableCents: input.enteredBalanceCents } : {}),
			...(isInvesting(input.accountType) ? { valuations: [{ date: input.enteredBalanceAsOf, valueCents: input.enteredBalanceCents, note: "" }] } : {}),
		};
		await this.store.port.create(accountPath(input.name), buildAccountNote(account));
		await this.store.reload();
	}

	async update(name: string, patch: AccountPatch): Promise<void> {
		const account = this.require(name);
		if (patch.enteredBalanceAsOf !== undefined && !isIsoDate(patch.enteredBalanceAsOf)) throw new LedgerError("The balance date is not a valid date");
		if (patch.enteredBalanceCents !== undefined && !Number.isSafeInteger(patch.enteredBalanceCents)) throw new LedgerError("The balance is not a valid amount");

		if (patch.unbalancedCents !== undefined && !Number.isSafeInteger(patch.unbalancedCents)) throw new LedgerError("The difference is not a valid amount");
		if (patch.color !== undefined && !isHexColor(patch.color)) throw new LedgerError("The color is not a valid #rrggbb color");

		if ("accountType" in patch) throw new LedgerError("An account's type cannot be changed; delete it and create a new one");
		if (isInvesting(account.accountType) && (patch.enteredBalanceCents !== undefined || patch.enteredBalanceAsOf !== undefined)) {
			throw new LedgerError("An investing account's balance comes from its entries; add or edit an entry instead");
		}

		const next = { ...account, ...patch };
		this.checkDebtFields(next.accountType, next);
		const balanceCents = currentBalance(next, accountTransactions(this.store.snapshot, name));
		const availableCents = account.accountType === "cash" ? balanceCents - bucketsTotal(bucketsOf(this.store.snapshot, name)) : undefined;
		const path = this.pathOf(name);
		const written = patch.color === undefined ? patch : { ...patch, color: patch.color.toLowerCase() };
		const touchesFlag = "unbalancedCents" in patch;
		await this.store.port.modify(path, (c) => patchProps(c, {
			...written,
			balanceCents,
			availableCents,
			...(touchesFlag ? unbalancedTagPatch(c, Boolean(patch.unbalancedCents)) : {}),
		}));
		await this.store.reload();
	}

	private checkEntry(entry: Pick<Valuation, "date" | "valueCents">): void {
		const problem = valuationProblem(entry);
		if (problem === "invalidDate") throw new LedgerError("The entry date is not a valid date");
		if (problem === "invalidValue") throw new LedgerError("The value must be a whole number of cents, zero or more");
	}

	// Writes the entries table and, in the same write, the entered balance and its date: always the
	// latest entry, so the cached properties and the Accounts list stay right without a replay.
	private async writeEntries(name: string, edit: (content: string) => string): Promise<void> {
		const account = this.require(name);
		if (!isInvesting(account.accountType)) throw new LedgerError("Only an investing account has entries");
		await this.store.port.modify(this.pathOf(name), (content) => {
			const next = edit(content);
			const latest = latestValuation(readValuations(next).valuations);
			if (!latest) throw new LedgerError("An investing account needs at least one entry");
			return patchProps(next, { enteredBalanceCents: latest.valueCents, enteredBalanceAsOf: latest.date, balanceCents: latest.valueCents });
		});
		await this.store.reload();
	}

	// An entry for a date that already has one replaces it; otherwise it is added in date order.
	async addEntry(name: string, entry: Valuation): Promise<void> {
		this.checkEntry(entry);
		await this.writeEntries(name, (c) => upsertValuationRow(c, { ...entry, note: entry.note.trim() }));
	}

	// Edits the entry dated `date`, its date included. Moving it onto a date that has another entry is refused.
	async editEntry(name: string, date: string, entry: Valuation): Promise<void> {
		this.checkEntry(entry);
		const record = this.store.snapshot.accounts.find((a) => a.account.name === name);
		if (record && entry.date !== date && record.account.valuations?.some((v) => v.date === entry.date)) {
			throw new LedgerError(`There is already an entry dated ${entry.date}`);
		}
		await this.writeEntries(name, (c) => upsertValuationRow(removeValuationRow(c, date), { ...entry, note: entry.note.trim() }));
	}

	// The last entry cannot be removed: the account would have no value at all.
	async removeEntry(name: string, date: string): Promise<void> {
		await this.writeEntries(name, (c) => removeValuationRow(c, date));
	}

	// Wires a debt payment subcategory to the one loan its payments go to, or to none. A
	// subcategory belongs to a single loan, so any other account holding it lets go.
	async setPaymentAccount(subcategory: string, accountName: string | undefined): Promise<void> {
		if (this.store.index.typeOf(subcategory) !== "debt") throw new LedgerError(`"${subcategory}" is not a debt payment subcategory`);
		const target = accountName === undefined ? undefined : this.require(accountName);
		if (target && target.accountType !== "loan") throw new LedgerError("Only a loan has a payment category; a credit card is paid with a transfer");

		for (const record of this.store.snapshot.accounts) {
			if (record.account.paymentSubcategory !== subcategory || record.account.name === accountName) continue;
			await this.store.port.modify(record.path, (c) => patchProps(c, { paymentSubcategory: undefined }));
		}
		if (accountName !== undefined) await this.update(accountName, { paymentSubcategory: subcategory });
		else await this.store.reload();
	}

	// Archiving takes an account out of the active lists; active accounts always count in net asset.
	async setActive(name: string, active: boolean): Promise<void> {
		const account = this.require(name);
		const patch: Props = active ? { active, includeInNetAsset: true } : { active };
		// Archiving gives up the buckets, so what they held is available again.
		const releases = !active && account.accountType === "cash" && bucketsOf(this.store.snapshot, name).length > 0;
		if (releases) patch.availableCents = account.balanceCents;
		await this.store.port.modify(this.pathOf(name), (c) => patchProps(releases ? clearBuckets(c) : c, patch));
		await this.store.reload();
	}

	async rename(oldName: string, newName: string): Promise<void> {
		const { snapshot, port } = this.store;
		const plan = await planAccountRename({ snapshot, read: async (p) => (await port.read(p)) ?? "" }, oldName, newName);
		await executePlan(port, plan);
		await this.store.reload();
	}

	async remove(name: string): Promise<void> {
		this.require(name);
		if (accountHasTransactions(this.store.snapshot, name)) throw new LedgerError("This account has transactions, so it can only be archived");
		const path = this.pathOf(name);
		await this.store.port.trash(path);
		await cleanupEmptyFolders(this.store.port, [path]);
		await this.store.reload();
	}

	private pathOf(name: string): string {
		return this.store.snapshot.accounts.find((a) => a.account.name === name)!.path;
	}
}
