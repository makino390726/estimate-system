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
