import { currentBalance } from "../domain/accounts";
import { isHexColor, nextAccountColor } from "../domain/colors";
import { isIsoDate } from "../domain/dates";
import { nameProblem } from "../domain/names";
import type { Account, AccountType } from "../domain/types";
import { buildAccountNote, unbalancedTagPatch } from "../notes/accountNote";
import { patchProps } from "../notes/frontmatter";
import { accountPath } from "../notes/paths";
import { planAccountRename } from "../rename/accountRename";
import { executePlan } from "../rename/execute";
import { accountHasTransactions, accountsOf, findAccount } from "../snapshot/queries";
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
}

// The user's own settings for an account; the cached balance is derived and never passed in.
export interface AccountPatch {
	accountType?: AccountType;
	includeInNetAsset?: boolean;
	enteredBalanceCents?: number;
	enteredBalanceAsOf?: string;
	color?: string;
	// Passing the key as undefined clears the flag; leaving it out keeps it.
	unbalancedCents?: number;
}

export class AccountService {
	constructor(private store: LedgerStore) {}

	private require(name: string): Account {
		const account = findAccount(this.store.snapshot, name);
		if (!account) throw new LedgerError(`No account named "${name}"`);
		return account;
	}

	async create(input: NewAccount): Promise<void> {
		const problem = nameProblem(input.name);
		if (problem) throw new LedgerError(`"${input.name}" is not a valid account name`);
		if (findAccount(this.store.snapshot, input.name)) throw new LedgerError(`An account named "${input.name}" already exists`);
		if (!isIsoDate(input.enteredBalanceAsOf)) throw new LedgerError("The balance date is not a valid date");
		if (!Number.isSafeInteger(input.enteredBalanceCents)) throw new LedgerError("The balance is not a valid amount");

		if (input.color !== undefined && !isHexColor(input.color)) throw new LedgerError("The color is not a valid #rrggbb color");

		const account: Account = {
			...input,
			color: (input.color ?? nextAccountColor(accountsOf(this.store.snapshot).map((a) => a.color))).toLowerCase(),
			active: true, includeInNetAsset: true, balanceCents: input.enteredBalanceCents,
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

		const next ={ ...account, ...patch };
		const balanceCents = currentBalance(next, accountTransactions(this.store.snapshot, name));
		const path = this.pathOf(name);
		const written = patch.color === undefined ? patch : { ...patch, color: patch.color.toLowerCase() };
		const touchesFlag = "unbalancedCents" in patch;
		await this.store.port.modify(path, (c) => patchProps(c, {
			...written,
			balanceCents,
			...(touchesFlag ? unbalancedTagPatch(c, Boolean(patch.unbalancedCents)) : {}),
		}));
		await this.store.reload();
	}

	// Archiving takes an account out of the active lists; active accounts always count in net asset.
	async setActive(name: string, active: boolean): Promise<void> {
		this.require(name);
		const patch = active ? { active, includeInNetAsset: true } : { active };
		await this.store.port.modify(this.pathOf(name), (c) => patchProps(c, patch));
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
