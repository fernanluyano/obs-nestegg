import { miscName } from "./names";
import type { Category, Settings, TransactionType } from "./types";

export const CREDIT_CARD_PAYMENT = "Credit card payment";

// Offered in tag autocomplete next to the tags already used. Tags are never stored on their own,
// so adding to this list changes no one's notes.
export const DEFAULT_TAGS: readonly string[] = ["need", "want"];

// No account exists on a new vault, so there is no default until the user creates one.
export const DEFAULT_SETTINGS: Settings = {
	defaultAccount: "",
	autoValidateOnLoad: true,
};

// Every category carries its own "<Category> - Misc" subcategory so a transaction always has one.
export function withMisc(name: string, categoryType: TransactionType, subcategories: string[]): Category {
	return { name, categoryType, subcategories: [...subcategories, miscName(name)] };
}

export function defaultCategories(): Category[] {
	return [
		withMisc("Food", "expense", ["Groceries", "Restaurants"]),
		withMisc("Housing", "expense", ["Rent", "Mortgage", "Utilities", "Household items"]),
		withMisc("Transportation", "expense", ["Fuel", "Parking", "Tolls"]),
		withMisc("Subscriptions", "expense", []),
		withMisc("Shopping", "expense", []),
		withMisc("Medical", "expense", []),
		withMisc("Insurance", "expense", []),
		withMisc("Lifestyle", "expense", []),
		withMisc("Giving", "expense", ["Charity", "Gifts"]),
		withMisc("Income", "income", ["Salary", "Interest"]),
		withMisc("Transfers", "transfer", ["Account transfer", CREDIT_CARD_PAYMENT]),
	];
}
