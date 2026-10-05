const DECIMAL_RE = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

// Parsed from the digits, not parseFloat(x) * 100, which turns "1.15" into 114.99999999999999.
export function parseCents(text: string): number | null {
	const m = DECIMAL_RE.exec(text.trim());
	if (!m) return null;
	const [, sign, whole, frac = ""] = m;
	const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
	if (!Number.isSafeInteger(cents)) return null;
	return sign === "-" && cents !== 0 ? -cents : cents;
}

export function centsToDecimal(cents: number): string {
	const abs = Math.abs(cents);
	const whole = Math.floor(abs / 100);
	const frac = abs % 100;
	return `${cents < 0 ? "-" : ""}${whole}.${frac < 10 ? "0" : ""}${frac}`;
}

// Display only: grouped dollars for rendering, never persisted or fed back into arithmetic.
export function formatCents(cents: number): string {
	const abs = Math.abs(cents);
	const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	const frac = abs % 100;
	return `${cents < 0 ? "-" : ""}${whole}.${frac < 10 ? "0" : ""}${frac}`;
}
