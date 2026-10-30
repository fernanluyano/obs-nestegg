import { isValidTag, MAX_TAG_LENGTH } from "../helpers";
import { DEFAULT_TAGS } from "./defaults";
import { normalizeTag } from "./names";

export const TAG_LIMIT = 3;

export type TagProblem = "tooLong" | "invalid" | "duplicate" | "tooMany" | "needAndWant" | "missingNeedWant";

// Every rule a transaction's tags must follow, in one place: the form, the saving service and the
// transactions list all ask here. A row is a need or a want, never both. Spending (not a refund)
// must carry one of them, which the caller asks for with `requireNeedOrWant`.
export function tagProblem(tags: string[], { requireNeedOrWant = false } = {}): TagProblem | null {
	const lowered = tags.map(normalizeTag);
	if (lowered.some((tag) => [...tag].length > MAX_TAG_LENGTH)) return "tooLong";
	if (!lowered.every(isValidTag)) return "invalid";
	if (new Set(lowered).size !== lowered.length) return "duplicate";
	if (lowered.length > TAG_LIMIT) return "tooMany";
	if (DEFAULT_TAGS.every((tag) => lowered.includes(tag))) return "needAndWant";
	if (requireNeedOrWant && !DEFAULT_TAGS.some((tag) => lowered.includes(tag))) return "missingNeedWant";
	return null;
}
