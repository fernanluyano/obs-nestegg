import { patchProps } from "../notes/frontmatter";
import type { LedgerStore } from "./LedgerStore";

// Debt accounts that named a removed subcategory for their payments lose the link.
// The caller reloads the store once its own change is done.
export async function clearPaymentLinks(store: LedgerStore, subcategories: string[]): Promise<void> {
	for (const record of store.snapshot.accounts) {
		const linked = record.account.paymentSubcategory;
		if (!linked || !subcategories.includes(linked)) continue;
		await store.port.modify(record.path, (content) => patchProps(content, { paymentSubcategory: undefined }));
	}
}
