import { DEFAULT_ACCOUNT_COLOR, isHexColor } from "../domain/colors";
import { isIsoDate } from "../domain/dates";
import { ACCOUNT_TYPES, type Account, type AccountType } from "../domain/types";
import { bool, buildNote, int, list, parseProps, str, type Props, type RawProps } from "./frontmatter";
import { NOTE_TAGS, UNBALANCED_TAG } from "./kinds";

export type ParsedAccount = { ok: true; account: Account } | { ok: false; reason: string };

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
