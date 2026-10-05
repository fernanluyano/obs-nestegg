import { App, TFile, TFolder } from "obsidian";
import { parseProps } from "../notes/frontmatter";
import { dirname, isInsideRoot } from "../notes/paths";
import type { VaultNote, VaultPort } from "./VaultPort";

// The only place that touches Obsidian's vault API. Properties are parsed from the note text on
// every listing rather than read from the metadataCache: the cache updates asynchronously after a
// write, and a stale read would show wrong balances. Reading the files is fast enough for a
// personal vault; the cache can be added later if it ever is not.
export class ObsidianVault implements VaultPort {
	constructor(private app: App) {}

	// Only the plugin's own folder is read, so the cost does not grow with the rest of the vault.
	async listNotes(): Promise<VaultNote[]> {
		const files = this.app.vault.getMarkdownFiles().filter((file) => isInsideRoot(file.path));
		return Promise.all(
			files.map(async (file) => ({
				path: file.path,
				props: parseProps(await this.app.vault.read(file)),
			})),
		);
	}

	async read(path: string): Promise<string | null> {
		const file = this.app.vault.getFileByPath(path);
		return file ? this.app.vault.read(file) : null;
	}

	exists(path: string): boolean {
		return this.app.vault.getFileByPath(path) !== null;
	}

	async create(path: string, content: string): Promise<void> {
		await this.ensureFolder(dirname(path));
		await this.app.vault.create(path, content);
	}

	async modify(path: string, fn: (content: string) => string): Promise<string> {
		return this.app.vault.process(this.require(path), fn);
	}

	async rename(from: string, to: string): Promise<void> {
		const file = this.require(from);
		await this.ensureFolder(dirname(to));
		await this.app.fileManager.renameFile(file, to);
	}

	async trash(path: string): Promise<void> {
		await this.app.fileManager.trashFile(this.require(path));
	}

	async removeFolderIfEmpty(path: string): Promise<void> {
		const folder = this.app.vault.getFolderByPath(path);
		if (folder && folder.children.length === 0) await this.app.fileManager.trashFile(folder);
	}

	private require(path: string): TFile {
		const file = this.app.vault.getFileByPath(path);
		if (!file) throw new Error(`No such file: ${path}`);
		return file;
	}

	private async ensureFolder(path: string): Promise<void> {
		if (path === "" || this.app.vault.getAbstractFileByPath(path) instanceof TFolder) return;
		await this.ensureFolder(dirname(path));
		try {
			await this.app.vault.createFolder(path);
		} catch (e) {
			// Two writes racing on first launch both try to create the same folder.
			if (!(e instanceof Error) || !e.message.includes("already exists")) throw e;
		}
	}
}
