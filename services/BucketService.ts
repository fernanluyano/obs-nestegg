import {
	bucketNameProblem, bucketsTotal, goalProblem, moveInProblem, moveOutProblem, type Bucket, type BucketProblem,
} from "../domain/buckets";
import { currentBalance } from "../domain/accounts";
import { addBucketRow, readBuckets, removeBucketRow, replaceBucketRow } from "../notes/bucketTable";
import { patchProps } from "../notes/frontmatter";
import { accountTransactions } from "../snapshot/snapshot";
import { LedgerError } from "./errors";
import type { LedgerStore } from "./LedgerStore";

const PROBLEMS: Record<BucketProblem, string> = {
	invalidAmount: "The amount is not valid",
	amountNotPositive: "The amount must be more than zero",
	invalidGoal: "A goal must be more than zero",
	exceedsAvailable: "That is more than the account has available",
	exceedsBucket: "That is more than the bucket holds",
	unknownBucket: "There is no such bucket",
};

// A bucket only splits an account's balance into set-aside and available money: no transaction,
// no history, and `balanceCents` is never touched, only `availableCents`.
export class BucketService {
	constructor(private store: LedgerStore) {}

	// Edits one account's bucket table and refreshes its cached available in the same write. The
	// table is read from the note itself, so a stale snapshot can never be written back over it.
	private async edit(account: string, fn: (content: string, buckets: Bucket[], availableCents: number) => string): Promise<void> {
		const record = this.store.snapshot.accounts.find((a) => a.account.name === account);
		if (!record) throw new LedgerError(`No account named "${account}"`);
		if (record.account.accountType !== "cash") throw new LedgerError("Only a cash account can have buckets");
		const balance = currentBalance(record.account, accountTransactions(this.store.snapshot, account));

		await this.store.port.modify(record.path, (content) => {
			const { buckets } = readBuckets(content);
			const edited = fn(content, buckets, balance - bucketsTotal(buckets));
			return patchProps(edited, { availableCents: balance - bucketsTotal(readBuckets(edited).buckets) });
		});
		await this.store.reload();
	}

	private find(buckets: Bucket[], name: string): Bucket {
		const bucket = buckets.find((b) => b.name === name);
		if (!bucket) throw new LedgerError(`No bucket named "${name}"`);
		return bucket;
	}

	private check(problem: BucketProblem | null): void {
		if (problem) throw new LedgerError(PROBLEMS[problem]);
	}

	async create(account: string, name: string, goalCents?: number): Promise<void> {
		this.check(goalProblem(goalCents));
		await this.edit(account, (content, buckets) => {
			const problem = bucketNameProblem(buckets, name);
			if (problem === "duplicate") throw new LedgerError(`A bucket named "${name}" already exists in ${account}`);
			if (problem) throw new LedgerError(`"${name}" is not a valid bucket name`);
			return addBucketRow(content, { name, balanceCents: 0, ...(goalCents === undefined ? {} : { goalCents }) });
		});
	}

	async moveIn(account: string, name: string, cents: number): Promise<void> {
		await this.edit(account, (content, buckets, available) => {
			const bucket = this.find(buckets, name);
			this.check(moveInProblem(cents, available));
			return replaceBucketRow(content, name, { ...bucket, balanceCents: bucket.balanceCents + cents });
		});
	}

	async moveOut(account: string, name: string, cents: number): Promise<void> {
		await this.edit(account, (content, buckets) => {
			const bucket = this.find(buckets, name);
			this.check(moveOutProblem(cents, bucket));
			return replaceBucketRow(content, name, { ...bucket, balanceCents: bucket.balanceCents - cents });
		});
	}

	// Passing no goal clears it.
	async setGoal(account: string, name: string, goalCents: number | undefined): Promise<void> {
		this.check(goalProblem(goalCents));
		await this.edit(account, (content, buckets) => {
			const { goalCents: _old, ...rest } = this.find(buckets, name);
			return replaceBucketRow(content, name, { ...rest, ...(goalCents === undefined ? {} : { goalCents }) });
		});
	}

	async rename(account: string, name: string, newName: string): Promise<void> {
		await this.edit(account, (content, buckets) => {
			const bucket = this.find(buckets, name);
			const problem = bucketNameProblem(buckets, newName, name);
			if (problem === "duplicate") throw new LedgerError(`A bucket named "${newName}" already exists in ${account}`);
			if (problem) throw new LedgerError(`"${newName}" is not a valid bucket name`);
			return replaceBucketRow(content, name, { ...bucket, name: newName });
		});
	}

	// What the bucket held goes back to available.
	async remove(account: string, name: string): Promise<void> {
		await this.edit(account, (content, buckets) => {
			this.find(buckets, name);
			return removeBucketRow(content, name);
		});
	}
}
