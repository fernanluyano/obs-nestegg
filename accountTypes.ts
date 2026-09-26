export interface AccountType {
	id: string;
	name: string;
}

function generateId(): string {
	return crypto.randomUUID();
}

// Seeded once on first load per kind (see main.ts). Types are create-only —
// an account is what gets deleted/archived, not a type.
export const SEED_ASSET_TYPE_NAMES = [
	"Cash/Bank",
	"Real Estate",
	"Precious Metals",
	"Retirement",
	"Investments/Brokerage",
	"Vehicle",
];

// Matches ~/dev/github/trading's finances DEBT_TYPES exactly (same order and
// labels), not guessed independently.
export const SEED_DEBT_TYPE_NAMES = ["Credit Card", "Student Loan", "Auto Loan", "Mortgage", "Other"];

export function seedAccountTypes(names: string[]): AccountType[] {
	return names.map((name) => ({ id: generateId(), name }));
}

function nameTaken(types: AccountType[], name: string): boolean {
	return types.some((type) => type.name.toLowerCase() === name.toLowerCase());
}

export function addAccountType(types: AccountType[], name: string): AccountType[] {
	const trimmed = name.trim();
	if (!trimmed || nameTaken(types, trimmed)) return types;
	return [...types, { id: generateId(), name: trimmed }];
}

export function accountTypeName(types: AccountType[], typeId: string): string | undefined {
	return types.find((type) => type.id === typeId)?.name;
}
