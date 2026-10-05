const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isIsoDate(text: string): boolean {
	const m = ISO_DATE_RE.exec(text);
	if (!m) return false;
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const date = new Date(y, mo - 1, d);
	return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

export function isYearMonth(text: string): boolean {
	return MONTH_RE.test(text);
}

export function monthOf(date: string): string {
	return date.substring(0, 7);
}

// Sorts at or after every real date in the month, so a plain string compare works as "end of month".
export function monthEndKey(yearMonth: string): string {
	return `${yearMonth}-31`;
}

export function todayString(now: Date = new Date()): string {
	const mm = String(now.getMonth() + 1).padStart(2, "0");
	const dd = String(now.getDate()).padStart(2, "0");
	return `${now.getFullYear()}-${mm}-${dd}`;
}
