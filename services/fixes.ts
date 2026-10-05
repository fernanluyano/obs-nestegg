import type { FixAction } from "../validation/describe";
import type { Ledger } from "./Ledger";

export async function applyFix(ledger: Ledger, action: FixAction, today: string): Promise<void> {
	const v = ledger.validation;
	switch (action.kind) {
		case "recalculateMonthTotals": return v.recalculateMonthTotals(action.path);
		case "recalculateBalance": return v.recalculateBalance(action.account);
		case "createMissingAccount": return v.createMissingAccount(action.account, today);
		case "resetDefaultAccount": return v.resetDefaultAccount();
		case "moveToExpectedPath": return v.moveToExpectedPath(action.path, action.expectedPath);
		case "promoteInTransit": return v.promoteInTransit(action.path);
		case "discardInTransit": return v.discardInTransit(action.path);
	}
}
