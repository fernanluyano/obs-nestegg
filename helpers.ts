const pad2 = (n: number): string => String(n).padStart(2, '0')

const monthKey = (date: Date): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`

export function thisMonth(): string {
  return monthKey(new Date())
}

export function shiftMonth(month: string, by: number): string {
  const [year, number] = month.split('-').map(Number)
  return monthKey(new Date(year, number - 1 + by, 1))
}

export function isFutureMonth(month: string): boolean {
  return month > thisMonth()
}

export const MAX_TAG_LENGTH = 16

// Letters, digits and dashes only: tags stay easy to type, search, and read back from a table cell.
const TAG_PATTERN = /^[a-z0-9-]+$/i

export function isValidTag(tag: string): boolean {
  return TAG_PATTERN.test(tag) && tag.length <= MAX_TAG_LENGTH
}

// Thousands separators on the whole part; whatever the user has typed after the point is kept as is,
// so "1234." and "1234.50" survive mid-input.
export function groupAmount(typed: string): string {
  if (!typed) return '0'
  const point = typed.indexOf('.')
  const whole = point === -1 ? typed : typed.slice(0, point)
  const wholeNumber = whole === '' ? 0 : Number(whole)
  const grouped = Number.isFinite(wholeNumber) ? wholeNumber.toLocaleString('en-US') : whole
  return point === -1 ? grouped : `${grouped}.${typed.slice(point + 1)}`
}

export function heroAmountLabel(typed: string, isRefund: boolean): string {
  const label = `$${groupAmount(typed)}`
  return isRefund && typed !== '' ? `+ ${label}` : label
}

export function monthAndDay(date: string): string {
  return date.substring(5).replace('-', '/')
}
