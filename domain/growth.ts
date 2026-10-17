// Growth of a balance over time. Ratios are fractions (0.05 is 5%); null means the figure is not
// defined, which is not the same as zero growth.

// Not defined from a zero or negative starting point, where a percent says nothing.
export function percentChange(fromCents: number, toCents: number): number | null {
	if (fromCents <= 0) return null;
	return (toCents - fromCents) / fromCents;
}

// Compound annual growth rate over a span of whole months. Needs a year of history and a balance
// that is positive at both ends; annualizing anything shorter blows a small move up into nonsense.
export function cagr(startCents: number, endCents: number, spanMonths: number): number | null {
	if (startCents <= 0 || endCents <= 0 || spanMonths < 12) return null;
	return Math.pow(endCents / startCents, 12 / spanMonths) - 1;
}

// Growth from the first month on record in the latest month's year to that latest month: January
// when the data reaches back that far, otherwise the first month there is data. `months` and
// `values` are consecutive months, oldest first; months before index `firstData` hold no real data.
// Null when the year has only one month on record, or the starting balance is not positive.
export function yearToDateRatio(months: string[], values: number[], firstData = 0): number | null {
	const last = months.length - 1;
	if (last < 0) return null;
	const year = months[last].slice(0, 4);
	const start = months.findIndex((month, i) => i >= firstData && month.startsWith(year));
	if (start === -1 || start === last) return null;
	return percentChange(values[start], values[last]);
}

export function formatPercent(ratio: number | null): string {
	if (ratio === null) return "n/a";
	const percent = (Math.round(ratio * 1000) / 10).toFixed(1);
	return `${ratio > 0 ? "+" : ""}${percent}%`;
}

export interface GrowthPoint {
	month: string;
	cents: number;
	changeCents: number | null; // against the previous month; null for the first month of the series
	changeRatio: number | null;
	yoyRatio: number | null; // against the same month a year before; null until there is one
}

// `months` and `values` are consecutive months, oldest first. Points are made from index `from` on,
// so the lead-in months before it supply the previous-month and year-ago figures. Months before
// index `firstData` hold no real data, only a balance replayed backward, so nothing is compared with them.
export function growthPoints(months: string[], values: number[], from: number, firstData = 0): GrowthPoint[] {
	return months.slice(from).map((month, offset) => {
		const i = from + offset;
		const cents = values[i];
		const previous = i - 1 >= firstData ? values[i - 1] : undefined;
		const yearAgo = i - 12 >= firstData ? values[i - 12] : undefined;
		return {
			month,
			cents,
			changeCents: previous === undefined ? null : cents - previous,
			changeRatio: previous === undefined ? null : percentChange(previous, cents),
			yoyRatio: yearAgo === undefined ? null : percentChange(yearAgo, cents),
		};
	});
}
