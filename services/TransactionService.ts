import { bulkReassignProblem, type BulkProblem } from "../domain/bulkEdit";
import { monthOf } from "../domain/dates";
import { entryProblem, transferProblem, type EntryProblem } from "../domain/entryRules";
import { normalizeTags } from "../domain/names";
import { accountsOf } from "../snapshot/queries";
import {
	isPartnerRow, sameTransaction, transferEntries, type TransactionDraft, type TransferInput,
} from "../domain/transactions";
import type { LedgerEntry, Transaction } from "../domain/types";
import { buildMonthNote, editMonthNote, type MonthEdit } from "../notes/monthNote";
import { monthPath } from "../notes/paths";
import { executePlan } from "../rename/execute";
import type { FileChange } from "../rename/types";
import { LedgerError } from "./errors";
import type { LedgerStore } from "./LedgerStore";
import { syncBalances } from "./balances";

const BULK_PROBLEMS: Record<BulkProblem, string> = {
	empty: "nothing is selected",
	transfer: "transfers keep their own subcategories",
	unknown: "a selected transaction uses a subcategory that no longer exists",
	mixed: "the selected transactions are of different types",
	badTarget: "that subcategory is not of the same type as the selected transactions",
};

const toTransaction =(e: LedgerEntry): Transaction => ({
	date: e.date, merchant: e.merchant, subcategory: e.subcategory, amountCents: e.amountCents,
	note: e.note, tags: e.tags, fromTo: e.fromTo,
});

function tidy<T extends { merchant: string; tags: string[] }>(value: T): T {
	return { ...value, merchant: value.merchant.trim(), tags: normalizeTags(value.tags) };
}

export class TransactionService {
	// Months written since the last reload, so only their cached running balances are dropped.
	private touchedMonths = new Set<string>();

	constructor(private store: LedgerStore) {}

	private context() {
		return { accounts: accountsOf(this.store.snapshot), index: this.store.index };
	}

	private fail(problem: EntryProblem | null): void {
		if (problem) throw new LedgerError(`Cannot save the transaction: ${problem}`);
	}

	private async applyEdit(account: string, month: string, edit: MonthEdit): Promise<void> {
		this.touchedMonths.add(month);
		const { port, snapshot, index } = this.store;
		const known = snapshot.months.find((m) => m.account === account && m.month === month);
		const path = known?.path ?? monthPath(account, month);
		if (!port.exists(path)) {
			if (edit.kind !== "add") throw new LedgerError("That transaction is no longer in the file");
			await port.create(path, buildMonthNote({ account, month }, [edit.tx], index));
			return;
		}
		await port.modify(path, (content) => editMonthNote(content, edit, index));
	}

	private async finish(accounts: string[]): Promise<void> {
		await this.store.reload([...this.touchedMonths]);
		this.touchedMonths.clear();
		await syncBalances(this.store, accounts);
	}

	private async insert(entry: LedgerEntry): Promise<void> {
		await this.applyEdit(entry.account, monthOf(entry.date), { kind: "add", tx: toTransaction(entry) });
	}

	private async remove(entry: LedgerEntry): Promise<void> {
		await this.applyEdit(entry.account, monthOf(entry.date), { kind: "remove", tx: toTransaction(entry) });
	}

	async add(raw: LedgerEntry): Promise<void> {
		const entry = tidy(raw);
		this.fail(entryProblem(entry, this.context()));
		await this.insert(entry);
		await this.finish([entry.account]);
	}

	// Two rows, one per account file; if the second write fails the first is taken back so a
	// half transfer is not left behind.
	async addTransfer(raw: TransferInput): Promise<void> {
		const input = tidy(raw);
		this.fail(transferProblem(input, this.context()));
		await this.insertPair(transferEntries(input));
		await this.finish([input.from, input.to]);
	}

	private async insertPair([first, second]: [LedgerEntry, LedgerEntry]): Promise<void> {
		await this.insert(first);
		try {
			await this.insert(second);
		} catch (e) {
			await this.remove(first).catch(() => undefined);
			throw e;
		}
	}

	async update(old: LedgerEntry, raw: LedgerEntry): Promise<void> {
		const next = tidy(raw);
		this.fail(entryProblem(next, this.context()));
		const oldMonth = monthOf(old.date);
		const newMonth = monthOf(next.date);

		if (old.account === next.account && oldMonth === newMonth) {
			await this.applyEdit(old.account, oldMonth, { kind: "replace", old: toTransaction(old), next: toTransaction(next) });
		} else {
			await this.remove(old);
			try {
				await this.insert(next);
			} catch (e) {
				await this.insert(old).catch(() => undefined);
				throw e;
			}
		}
		await this.finish([old.account, next.account]);
	}

	async updateTransfer(old: LedgerEntry, raw: TransferInput): Promise<void> {
		const input = tidy(raw);
		this.fail(transferProblem(input, this.context()));
		const removed = await this.removePair(old);
		try {
			await this.insertPair(transferEntries(input));
		} catch (e) {
			for (const entry of removed) await this.insert(entry).catch(() => undefined);
			throw e;
		}
		await this.finish([...removed.map((e) => e.account), input.from, input.to]);
	}

	// The single entry point for the form: creates when `old` is null, otherwise replaces `old`,
	// including the cases where the edit turns a plain row into a transfer or the other way round.
	async save(old: LedgerEntry | null, draft: TransactionDraft): Promise<void> {
		if (!old) {
			if (draft.kind === "entry") await this.add(draft.entry);
			else await this.addTransfer(draft.input);
			return;
		}
		const wasTransfer = old.fromTo !== "";
		if (!wasTransfer && draft.kind === "entry") return this.update(old, draft.entry);
		if (wasTransfer && draft.kind === "transfer") return this.updateTransfer(old, draft.input);
		await this.changeKind(old, draft);
	}

	private async changeKind(old: LedgerEntry, draft: TransactionDraft): Promise<void> {
		const rows = draft.kind === "entry" ? [tidy(draft.entry)] : transferEntries(tidy(draft.input));
		this.fail(draft.kind === "entry" ? entryProblem(rows[0], this.context()) : transferProblem(tidy(draft.input), this.context()));
		const removed = await this.removePair(old);
		try {
			if (rows.length === 2) await this.insertPair(rows as [LedgerEntry, LedgerEntry]);
			else await this.insert(rows[0]);
		} catch (e) {
			for (const entry of removed) await this.insert(entry).catch(() => undefined);
			throw e;
		}
		await this.finish([...removed.map((e) => e.account), ...rows.map((r) => r.account)]);
	}

	// Edits grouped by file and applied in one write each. A change that spans several files goes
	// through the stage, validate and swap step, so a failure leaves every file as it was.
	private async applyBulk(edits: { account: string; month: string; edit: MonthEdit }[]): Promise<void> {
		const { port, snapshot, index } = this.store;
		const byPath = new Map<string, MonthEdit[]>();
		for (const { account, month, edit } of edits) {
			const path = snapshot.months.find((m) => m.account === account && m.month === month)?.path;
			if (!path) throw new LedgerError("That transaction is no longer in the file");
			this.touchedMonths.add(month);
			byPath.set(path, [...(byPath.get(path) ?? []), edit]);
		}
		const fold = (list: MonthEdit[]) => (content: string) => list.reduce((text, edit) => editMonthNote(text, edit, index), content);

		if (byPath.size === 1) {
			const [[path, list]] = byPath;
			await port.modify(path, fold(list));
			return;
		}
		const changes: FileChange[] = [];
		for (const [path, list] of byPath) changes.push({ fromPath: path, toPath: path, content: fold(list)((await port.read(path)) ?? "") });
		await executePlan(port, { changes });
	}

	// A selected transfer row takes its partner in the other account with it, unless that row is
	// selected too.
	private withPartners(entries: LedgerEntry[]): LedgerEntry[] {
		const rows = [...entries];
		const paired = new Set<number>();
		entries.forEach((entry, i) => {
			if (entry.fromTo === "" || paired.has(i)) return;
			const partner = this.findPartner(entry);
			if (!partner) return;
			paired.add(i);
			const at = rows.findIndex((r, k) => k !== i && !paired.has(k) && r.account === partner.account && sameTransaction(r, partner));
			if (at >= 0) paired.add(at);
			else paired.add(rows.push(partner) - 1);
		});
		return rows;
	}

	async deleteMany(entries: LedgerEntry[]): Promise<void> {
		if (entries.length === 0) return;
		const rows = this.withPartners(entries);
		await this.applyBulk(rows.map((e) => ({ account: e.account, month: monthOf(e.date), edit: { kind: "remove", tx: toTransaction(e) } })));
		await this.finish(rows.map((e) => e.account));
	}

	// Points the rows at another subcategory of their own type; amounts and dates stay as they are.
	async reassignMany(entries: LedgerEntry[], subcategory: string): Promise<void> {
		const categories = this.store.snapshot.categories.map((c) => c.category);
		const problem = bulkReassignProblem(entries, subcategory, categories, this.store.index);
		if (problem) throw new LedgerError(`Cannot change the subcategory: ${BULK_PROBLEMS[problem]}`);

		const changing = entries.filter((e) => e.subcategory !== subcategory);
		await this.applyBulk(changing.map((e) => ({
			account: e.account,
			month: monthOf(e.date),
			edit: { kind: "replace", old: toTransaction(e), next: { ...toTransaction(e), subcategory } },
		})));
		await this.finish(changing.map((e) => e.account));
	}

	async delete(entry: LedgerEntry): Promise<void> {
		const removed = await this.removePair(entry);
		await this.finish(removed.map((e) => e.account));
	}

	// Removes the row and, for a transfer row, its partner in the other account's file.
	private async removePair(entry: LedgerEntry): Promise<LedgerEntry[]> {
		const removed: LedgerEntry[] = [entry];
		const partner = entry.fromTo === "" ? undefined : this.findPartner(entry);
		await this.remove(entry);
		if (partner) {
			try {
				await this.remove(partner);
				removed.push(partner);
			} catch (e) {
				await this.insert(entry).catch(() => undefined);
				throw e;
			}
		}
		return removed;
	}

	private findPartner(row: LedgerEntry): LedgerEntry | undefined {
		for (const m of this.store.snapshot.months) {
			if (m.account !== row.fromTo) continue;
			for (const tx of m.transactions) {
				const candidate: LedgerEntry = { ...tx, account: m.account };
				if (isPartnerRow(row, candidate) && !sameTransaction(candidate, row)) return candidate;
			}
		}
		return undefined;
	}
}
