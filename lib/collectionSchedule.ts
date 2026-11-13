/** 請求予定日から、顧客の締日と回収サイクルで回収月を出す。99・0・31超は月末。 */

export function normalizeCustomerName(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[㈱]/g, '株式会社')
    .replace(/[㈲]/g, '有限会社')
    .replace(/[\s　]/g, '')
    .replace(/[‐–—−ー－]/g, '-')
    .toLowerCase()
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function addMonths(year: number, month: number, add: number): { year: number; month: number } {
  const date = new Date(year, month - 1 + add, 1)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

function resolveCalendarDay(day: number, year: number, month: number): number {
  const last = lastDayOfMonth(year, month)
  if (day === 99 || day === 0 || day > 31) return last
  return Math.min(Math.max(day, 1), last)
}

/** 回収月。条件が足りなければ null（画面では「条件なし」）。 */
export function collectionMonthLabel(
  billingDate: string | null | undefined,
  closeDay: number | null | undefined,
  cycle: number | null | undefined,
): string | null {
  if (!billingDate || closeDay == null || cycle == null) return null
  const raw = new Date(`${String(billingDate).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(raw.getTime())) return null
  const year = raw.getFullYear()
  const month = raw.getMonth() + 1
  const day = raw.getDate()
  let closeYear = year
  let closeMonth = month
  if (day > resolveCalendarDay(closeDay, year, month)) {
    const next = addMonths(year, month, 1)
    closeYear = next.year
    closeMonth = next.month
  }
  const due = addMonths(closeYear, closeMonth, cycle)
  return `${due.year}年${due.month}月`
}
