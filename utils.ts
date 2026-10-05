export function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function stepMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function isAfterCurrentMonth(ym: string): boolean {
  return ym > currentYearMonth()
}

export const TAG_MAX_LENGTH = 16

// Letters, digits and dashes only: tags stay easy to type, search, and read back from a table cell.
const TAG_CHARS_RE = /^[a-z0-9-]+$/i

export function validateTag(tag: string): boolean {
  return TAG_CHARS_RE.test(tag) && tag.length <= TAG_MAX_LENGTH
}

export function formatHeroAmount(raw: string): string {
  if (!raw) return '0'
  const dotIdx = raw.indexOf('.')
  const intPart = dotIdx === -1 ? raw : raw.slice(0, dotIdx)
  const decPart = dotIdx === -1 ? null : raw.slice(dotIdx + 1)

  const intNum = intPart === '' ? 0 : Number(intPart)
  const intStr = Number.isFinite(intNum)
    ? intNum.toLocaleString('en-US')
    : intPart

  if (dotIdx === -1) return intStr
  return `${intStr}.${decPart}`
}

export function formatMobileHeroAmount(raw: string, isRefund: boolean): string {
  const amount = `$${formatHeroAmount(raw)}`
  return isRefund && raw !== '' ? `+ ${amount}` : amount
}

export function dateToMonthDay(date: string): string {
  return date.substring(5).replace('-', '/')
}
