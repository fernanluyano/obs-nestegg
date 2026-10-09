import { loanFieldProblem } from "../domain/accounts";
import { DEFAULT_ACCOUNT_COLOR, isHexColor } from "../domain/colors";
import { isIsoDate } from "../domain/dates";
import { ACCOUNT_TYPES, isLiability, LOAN_KINDS, type Account, type AccountType, type LoanKind } from "../domain/types";
import { bool, buildNote, int, list, parseProps, str, type Props, type RawProps } from "./frontmatter";
import { NOTE_TAGS, UNBALANCED_TAG } from "./kinds";

export type ParsedAccount = { ok: true; account: Account } | { ok: false; reason: string };

type Fields<T> = { ok: true; fields: T } | { ok: false; reason: string };
type LoanFields = Pick<Account, "loanKind" | "termMonths" | "startDate" | "interest">;

const isSet = (props: RawProps, key: string) => props[key] !== undefined && props[key] !== "";

// A loan's kind is required; the plan fields are optional but must be valid when present.
function parseLoanFields(props: RawProps): Fields<LoanFields> {
	const loanKind = str(props, "loanKind");
	if (!loanKind || !LOAN_KINDS.includes(loanKind as LoanKind)) return { ok: false, reason: `loanKind must be one of ${LOAN_KINDS.join(", ")}` };
	const fields: LoanFields = { loanKind: loanKind as LoanKind };

	if (isSet(props, "termMonths")) {
		const termMonths = int(props, "termMonths");
		if (termMonths === undefined || termMonths < 1) return { ok: false, reason: "termMonths must be a whole number of at least 1" };
		fields.termMonths = termMonths;
	}
	if (isSet(props, "startDate")) {
		const startDate = str(props, "startDate");
		if (!startDate || !isIsoDate(startDate)) return { ok: false, reason: "startDate must be a YYYY-MM-DD date" };
		fields.startDate = startDate;
	}
	if (isSet(props, "interest")) {
		const interest = Number(str(props, "interest")?.trim());
		if (Number.isNaN(interest) || loanFieldProblem({ interest })) return { ok: false, reason: "interest must be a percent of zero or more with up to three decimals" };
		fields.interest = interest;
	}
	return { ok: true, fields };
}

export function parseAccountProps(props: RawProps): ParsedAccount {
	const name = str(props, "name")?.trim();
	if (!name) return { ok: false, reason: "missing name" };

	const accountType = str(props, "accountType");
	if (!accountType || !ACCOUNT_TYPES.includes(accountType as AccountType)) {
		return { ok: false, reason: `accountType must be one of ${ACCOUNT_TYPES.join(", ")}` };
	}

	const enteredBalanceAsOf = str(props, "enteredBalanceAsOf") ?? "";
	if (!isIsoDate(enteredBalanceAsOf)) return { ok: false, reason: "enteredBalanceAsOf must be a YYYY-MM-DD date" };

	const enteredBalanceCents = int(props, "enteredBalanceCents") ?? 0;
	const active = bool(props, "active") ?? true;
	const color = str(props, "color");
	const unbalancedCents = int(props, "unbalancedCents");

	let loan: LoanFields = {};
	if (accountType === "loan") {
		const parsed = parseLoanFields(props);
		if (!parsed.ok) return parsed;
		loan = parsed.fields;
	}
	const paymentSubcategory = isLiability(accountType as AccountType) ? str(props, "paymentSubcategory")?.trim() : undefined;
	return {
		ok: true,
		account: {
			name,
			accountType: accountType as AccountType,
			active,
			includeInNetAsset: active ? true : (bool(props, "includeInNetAsset") ?? false),
			enteredBalanceCents,
			enteredBalanceAsOf,
			balanceCents: int(props, "balanceCents") ?? enteredBalanceCents,
			color: color && isHexColor(color) ? color.toLowerCase() : DEFAULT_ACCOUNT_COLOR,
				...loan,
				...(paymentSubcategory ? { paymentSubcategory } : {}),
			...(unbalancedCents ? { unbalancedCents } : {}),
		},
	};
}

// `state` is not part of the account; callers pass it when staging a copy.
export function accountProps(account: Account, extra: Props = {}): Props {
	return {
		tags: [NOTE_TAGS.account, ...(account.unbalancedCents ? [UNBALANCED_TAG] : [])],
		state: "current",
		name: account.name,
		accountType: account.accountType,
		active: account.active,
		includeInNetAsset: account.includeInNetAsset,
		enteredBalanceCents: account.enteredBalanceCents,
		enteredBalanceAsOf: account.enteredBalanceAsOf,
		balanceCents: account.balanceCents,
		color: account.color,
		...(account.unbalancedCents ? { unbalancedCents: account.unbalancedCents } : {}),
		loanKind: account.loanKind,
		termMonths: account.termMonths,
		startDate: account.startDate,
		interest: account.interest,
		paymentSubcategory: account.paymentSubcategory,
		...extra,
	};
}

// The `tags` patch that adds or removes the unbalanced tag while keeping every other tag the note has.
export function unbalancedTagPatch(content: string, unbalanced: boolean): Props {
	const others = list(parseProps(content), "tags").filter((t) => t.replace(/^#/, "") !== UNBALANCED_TAG);
	return { tags: unbalanced ? [...others, UNBALANCED_TAG] : others };
}

export function buildAccountNote(account: Account): string {
	return buildNote(accountProps(account), "");
}
