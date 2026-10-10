import { formatCents } from "../domain/money";
import { basenameNoExt } from "../notes/paths";
import { tn, type LabelKey } from "../labels";
import type { ValidationIssue } from "./issues";

export type FixAction =
	| { kind: "recalculateMonthTotals"; path: string }
	| { kind: "recalculateBalance"; account: string }
	| { kind: "createMissingAccount"; account: string }
	| { kind: "resetDefaultAccount" }
	| { kind: "moveToExpectedPath"; path: string; expectedPath: string }
	| { kind: "promoteInTransit"; path: string }
	| { kind: "discardInTransit"; path: string };

export interface IssueFix {
	label: LabelKey;
	action: FixAction;
}

export interface IssueView {
	section: LabelKey;
	text: string;
	fixes: IssueFix[];
	// Safe to apply without asking again; leftover staged copies are never auto-fixed because
	// choosing between promote and discard is the user's call.
	auto: boolean;
}

const stored = (v: number | undefined) => (v === undefined ? "—" : formatCents(v));

export function describeIssue(issue: ValidationIssue): IssueView {
	switch (issue.type) {
		case "monthTotals":
			return {
				section: "validation.section.monthTotals",
				text: tn("validation.desc.monthTotals", {
					account: issue.account,
					month: issue.month,
					actualIncome: formatCents(issue.actual.incomeCents),
					storedIncome: stored(issue.stored.incomeCents),
					actualExpense: formatCents(issue.actual.expenseCents),
					storedExpense: stored(issue.stored.expenseCents),
				}),
				fixes: [{ label: "validation.fix.recalculate", action: { kind: "recalculateMonthTotals", path: issue.path } }],
				auto: true,
			};
		case "accountBalance":
			return {
				section: "validation.section.accountBalance",
				text: tn("validation.desc.accountBalance", {
					account: issue.account,
					actual: formatCents(issue.actualCents),
					stored: formatCents(issue.storedCents),
				}),
				fixes: [{ label: "validation.fix.recalculate", action: { kind: "recalculateBalance", account: issue.account } }],
				auto: true,
			};
		case "accountAvailable":
			return {
				section: "validation.section.accountAvailable",
				text: tn("validation.desc.accountAvailable", {
					account: issue.account,
					actual: formatCents(issue.actualCents),
					stored: formatCents(issue.storedCents),
				}),
				fixes: [{ label: "validation.fix.recalculate", action: { kind: "recalculateBalance", account: issue.account } }],
				auto: true,
			};
		case "negativeAvailable":
			return info("validation.section.negativeAvailable", tn("validation.desc.negativeAvailable", {
				account: issue.account,
				available: formatCents(issue.availableCents),
				balance: formatCents(issue.balanceCents),
				buckets: formatCents(issue.bucketsCents),
			}));
		case "malformedRow":
			return info("validation.section.malformedRow", tn("validation.desc.malformedRow", {
				file: basenameNoExt(issue.path), line: String(issue.line), reason: issue.reason,
			}));
		case "orphanedAccount":
			return {
				section: "validation.section.orphanedAccount",
				text: tn("validation.desc.orphanedAccount", {
					account: issue.account, count: String(issue.transactionCount), months: issue.months.join(", "),
				}),
				fixes: [{ label: "validation.fix.createAccount", action: { kind: "createMissingAccount", account: issue.account } }],
				auto: true,
			};
		case "duplicateName":
			return info("validation.section.duplicateName", tn("validation.desc.duplicateName", {
				kind: issue.kind, name: issue.name, paths: issue.paths.join(", "),
			}));
		case "duplicateMonth":
			return info("validation.section.duplicateMonth", tn("validation.desc.duplicateMonth", {
				account: issue.account, month: issue.month, paths: issue.paths.join(", "),
			}));
		case "duplicateSubcategory":
			return info("validation.section.duplicateSubcategory", tn("validation.desc.duplicateSubcategory", {
				subcategory: issue.subcategory, categories: issue.categories.join(", "),
			}));
		case "unknownSubcategory":
			return info("validation.section.unknownSubcategory", tn("validation.desc.unknownSubcategory", {
				subcategory: issue.subcategory, count: String(issue.transactionCount), months: issue.months.join(", "),
			}));
		case "transfer":
			return info("validation.section.transfer", tn(`validation.desc.transfer.${issue.problem}`, {
				account: issue.account, date: issue.date, other: issue.fromTo, amount: formatCents(Math.abs(issue.amountCents)),
			}));
		case "pathMismatch":
			return {
				section: "validation.section.pathMismatch",
				text: tn("validation.desc.pathMismatch", { path: issue.path, expected: issue.expectedPath }),
				fixes: [{ label: "validation.fix.move", action: { kind: "moveToExpectedPath", path: issue.path, expectedPath: issue.expectedPath } }],
				auto: false,
			};
		case "inTransit":
			return {
				section: "validation.section.inTransit",
				text: tn("validation.desc.inTransit", { path: issue.path }),
				fixes: [
					{ label: "validation.fix.promote", action: { kind: "promoteInTransit", path: issue.path } },
					{ label: "validation.fix.discard", action: { kind: "discardInTransit", path: issue.path } },
				],
				auto: false,
			};
		case "invalidNote":
			return info("validation.section.invalidNote", tn("validation.desc.invalidNote", { path: issue.path, reason: issue.reason }));
		case "invalidDefaultAccount":
			return {
				section: "validation.section.invalidDefaultAccount",
				text: tn("validation.desc.invalidDefaultAccount", { name: issue.defaultAccount }),
				fixes: [{ label: "validation.fix.useFirstAccount", action: { kind: "resetDefaultAccount" } }],
				auto: true,
			};
	}
}

function info(section: LabelKey, text: string): IssueView {
	return { section, text, fixes: [], auto: false };
}

// Groups views by section, keeping the order sections first appear in.
export function groupBySection(views: IssueView[]): Map<LabelKey, IssueView[]> {
	const groups = new Map<LabelKey, IssueView[]>();
	for (const view of views) groups.set(view.section, [...(groups.get(view.section) ?? []), view]);
	return groups;
}
