/** 会計年度は 前年9/1–当年8/31。fiscal_year は終了年（2027年度 = 2026/9/1–2027/8/31）。 */

export function fiscalYearFromDate(date = new Date()): number {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  return m >= 9 ? y + 1 : y
}

export function defaultSheetFiscalYear(date = new Date()): number {
  const current = fiscalYearFromDate(date)
  return date.getMonth() + 1 === 8 ? current + 1 : current
}

export function fiscalYearRange(fiscalYear: number): { from: string; to: string } {
  return {
    from: `${fiscalYear - 1}-09-01`,
    to: `${fiscalYear}-08-31`,
  }
}

export function fiscalYearLabel(fiscalYear: number): string {
  return `${fiscalYear}年度（${fiscalYear - 1}/9/1–${fiscalYear}/8/31）`
}

export function fiscalElapsedPct(date = new Date(), fiscalYear?: number): number {
  const fy = fiscalYear ?? fiscalYearFromDate(date)
  const start = new Date(`${fy - 1}-09-01T00:00:00`)
  const end = new Date(`${fy}-09-01T00:00:00`)
  const total = end.getTime() - start.getTime()
  const elapsed = Math.min(Math.max(date.getTime() - start.getTime(), 0), total)
  if (total <= 0) return 0
  return Math.round((elapsed / total) * 100)
}

export function fiscalYearOptions(around = fiscalYearFromDate()): number[] {
  return [around - 1, around, around + 1]
}

export type FiscalMonthSlot = {
  index: number
  year: number
  month: number
  key: string
  label: string
}

/** 会計年度の 9月〜8月 */
export function fiscalMonthSlots(fiscalYear: number): FiscalMonthSlot[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i < 4 ? i + 9 : i - 3
    const year = i < 4 ? fiscalYear - 1 : fiscalYear
    return {
      index: i,
      year,
      month,
      key: `${year}-${String(month).padStart(2, '0')}`,
      label: `${month}月`,
    }
  })
}

export function fiscalMonthIndex(isoDate: string, fiscalYear: number): number | null {
  const raw = String(isoDate || '').slice(0, 10)
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  if (y === fiscalYear - 1 && m >= 9) return m - 9
  if (y === fiscalYear && m <= 8) return m + 3
  return null
}
