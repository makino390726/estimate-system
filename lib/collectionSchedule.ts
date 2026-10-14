/** 入金予定の対象。成約=受注、および完了 */
export const COLLECTION_CASE_STATUSES = ['受注', '完了'] as const

export type CustomerCollectionTerms = {
  customer_code?: string | null
  name: string
  close_day: number | null
  collect_cycle: number | null
  collect_cycle_name?: string | null
  collect_day: number | null
  collect_term_name?: string | null
}

export type CollectionDue = {
  dueDate: string
  dueMonth: string
  dueMonthLabel: string
}

export function normalizeCustomerName(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[㈱]/g, '株式会社')
    .replace(/[㈲]/g, '有限会社')
    .replace(/[\s　]/g, '')
    .replace(/[‐–—−ー－]/g, '-')
    .toLowerCase()
}

function toInt(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function addMonths(year: number, month: number, add: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + add, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/** 99・0・32以上は月末 */
export function resolveCalendarDay(day: number | null | undefined, year: number, month: number): number {
  const last = lastDayOfMonth(year, month)
  if (day == null || day === 99 || day === 0 || day > 31) return last
  return Math.min(day, last)
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function formatDueMonthLabel(dueMonth: string): string {
  const [y, m] = dueMonth.split('-')
  if (!y || !m) return dueMonth
  return `${y}年${Number(m)}月`
}

/**
 * 作成日（成約日が無いため起算）から回収予定日を出す。
 * 締日を過ぎていれば翌締め、そこに回収サイクル月を足し、回収日を当てる。
 */
export function calcCollectionDue(
  baseDate: string | Date,
  terms: Pick<CustomerCollectionTerms, 'close_day' | 'collect_cycle' | 'collect_day'>,
): CollectionDue | null {
  if (terms.close_day == null && terms.collect_day == null && terms.collect_cycle == null) return null
  const raw = typeof baseDate === 'string' ? new Date(`${String(baseDate).slice(0, 10)}T00:00:00`) : baseDate
  if (Number.isNaN(raw.getTime())) return null

  const year = raw.getFullYear()
  const month = raw.getMonth() + 1
  const day = raw.getDate()
  const closeThisMonth = resolveCalendarDay(terms.close_day, year, month)
  let closeYear = year
  let closeMonth = month
  if (day > closeThisMonth) {
    const next = addMonths(year, month, 1)
    closeYear = next.year
    closeMonth = next.month
  }

  const cycle = Number.isFinite(Number(terms.collect_cycle)) ? Number(terms.collect_cycle) : 0
  const due = addMonths(closeYear, closeMonth, cycle)
  const dueDay = resolveCalendarDay(terms.collect_day, due.year, due.month)
  const dueDate = `${due.year}-${pad2(due.month)}-${pad2(dueDay)}`
  const dueMonth = `${due.year}-${pad2(due.month)}`
  return { dueDate, dueMonth, dueMonthLabel: formatDueMonthLabel(dueMonth) }
}

export function parseCollectionMasterRow(row: Record<string, unknown>): CustomerCollectionTerms | null {
  const name = String(row['名称'] || row['名称(1)'] || '').trim()
  if (!name) return null
  const close_day = toInt(row['締日(1)'] ?? row['締日（1）'])
  const collect_cycle = toInt(row['回収サイクル(1)'] ?? row['回収サイクル（1）'])
  const collect_day = toInt(row['回収日(1)'] ?? row['回収日（1）'])
  if (close_day == null && collect_cycle == null && collect_day == null) return null
  return {
    customer_code: String(row['得意先コード'] || '').trim() || null,
    name,
    close_day,
    collect_cycle,
    collect_cycle_name: String(row['回収サイクル名(1)'] || row['回収サイクル名（1）'] || '').trim() || null,
    collect_day,
    collect_term_name: String(row['回収条件1取引条件名1'] || '').trim() || null,
  }
}

export function collectionTermsKey(name: string, code?: string | null): string[] {
  const keys = [normalizeCustomerName(name)]
  if (code) keys.push(`code:${String(code).replace(/^0+/, '')}`)
  return keys.filter(Boolean)
}
