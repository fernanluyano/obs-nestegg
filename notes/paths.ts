export const ROOT_FOLDER = "Nestegg";
const ACCOUNTS_FOLDER = `${ROOT_FOLDER}/Accounts`;
const CATEGORIES_FOLDER = `${ROOT_FOLDER}/Categories`;

export const SETTINGS_PATH = `${ROOT_FOLDER}/Settings.md`;

export function accountFolder(name: string): string {
	return `${ACCOUNTS_FOLDER}/${name}`;
}

export function accountPath(name: string): string {
	return `${accountFolder(name)}/${name}.md`;
}

export function monthPath(account: string, month: string): string {
	return `${accountFolder(account)}/Transactions/${month}.md`;
}

export function categoryPath(name: string): string {
	return `${CATEGORIES_FOLDER}/${name}.md`;
}

export function isInsideRoot(path: string): boolean {
	return path.startsWith(`${ROOT_FOLDER}/`);
}

export function dirname(path: string): string {
	const i = path.lastIndexOf("/");
	return i < 0 ? "" : path.slice(0, i);
}

export function basenameNoExt(path: string): string {
	const file = path.slice(path.lastIndexOf("/") + 1);
	return file.replace(/\.md$/, "");
}

// Staged copies sit beside the file they will replace under a throwaway name.
export function transitPath(path: string): string {
	return `${dirname(path)}/${basenameNoExt(path)} (in transit).md`;
}
