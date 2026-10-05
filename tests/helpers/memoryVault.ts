import { parseProps } from "../../notes/frontmatter";
import type { NoteInput } from "../../snapshot/snapshot";
import type { VaultNote, VaultPort } from "../../storage/VaultPort";

type Op = "create" | "modify" | "rename" | "trash";

// An in-memory vault whose properties are parsed from content on every listing, standing in for
// the metadataCache. `failOn` injects a one-shot error to exercise partial-failure paths.
export class MemoryVault implements VaultPort {
	files = new Map<string, string>();
	trashed: string[] = [];
	removedFolders: string[] = [];
	private failures = new Map<string, Error>();

	constructor(initial: Record<string, string> = {}) {
		for (const [path, content] of Object.entries(initial)) this.files.set(path, content);
	}

	static fromInputs(inputs: NoteInput[]): MemoryVault {
		return new MemoryVault(Object.fromEntries(inputs.map((i) => [i.path, i.content])));
	}

	failOn(op: Op, path: string, error = new Error(`${op} failed: ${path}`)): void {
		this.failures.set(`${op}:${path}`, error);
	}

	private maybeFail(op: Op, path: string): void {
		const key = `${op}:${path}`;
		const error = this.failures.get(key);
		if (!error) return;
		this.failures.delete(key);
		throw error;
	}

	async listNotes(): Promise<VaultNote[]> {
		return [...this.files.keys()]
			.filter((p) => p.endsWith(".md"))
			.sort()
			.map((path) => ({ path, props: parseProps(this.files.get(path)!) }));
	}

	async read(path: string): Promise<string | null> {
		return this.files.get(path) ?? null;
	}

	exists(path: string): boolean {
		return this.files.has(path);
	}

	async create(path: string, content: string): Promise<void> {
		this.maybeFail("create", path);
		if (this.files.has(path)) throw new Error(`File already exists: ${path}`);
		this.files.set(path, content);
	}

	async modify(path: string, fn: (content: string) => string): Promise<string> {
		this.maybeFail("modify", path);
		const current = this.files.get(path);
		if (current === undefined) throw new Error(`No such file: ${path}`);
		const next = fn(current);
		this.files.set(path, next);
		return next;
	}

	async rename(from: string, to: string): Promise<void> {
		this.maybeFail("rename", from);
		const content = this.files.get(from);
		if (content === undefined) throw new Error(`No such file: ${from}`);
		if (this.files.has(to)) throw new Error(`File already exists: ${to}`);
		this.files.delete(from);
		this.files.set(to, content);
	}

	async trash(path: string): Promise<void> {
		this.maybeFail("trash", path);
		if (!this.files.delete(path)) throw new Error(`No such file: ${path}`);
		this.trashed.push(path);
	}

	async removeFolderIfEmpty(path: string): Promise<void> {
		if ([...this.files.keys()].some((p) => p.startsWith(`${path}/`))) return;
		this.removedFolders.push(path);
	}
}
