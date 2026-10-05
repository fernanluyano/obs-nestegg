import { Ledger } from "../../services/Ledger";
import type { NoteInput } from "../../snapshot/snapshot";
import { MemoryVault } from "./memoryVault";
import { account, vaultInputs } from "./fixtures";

export const TODAY = "2026-10-04";

export async function loadedLedger(inputs: NoteInput[] = vaultInputs({
	accounts: [account({ balanceCents: 200000 }), account({ name: "Savings", balanceCents: 200000 }), account({ name: "Card", accountType: "creditCard", enteredBalanceCents: 0, balanceCents: 0 })],
	months: [],
})) {
	const vault = MemoryVault.fromInputs(inputs);
	const ledger = new Ledger(vault);
	await ledger.load();
	return { vault, ledger };
}
