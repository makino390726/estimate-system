import * as XLSX from 'xlsx'
import { excelPlanCategoryFor } from '@/lib/annualPlanCategories'
import { fiscalYearFromDate, fiscalYearRange } from '@/lib/annualPlanFiscal'

export type ParsedSalesActualRow = {
  slip_no: string
  billed_on: string | null
  product_code: string
  product_name: string
  customer_code: string
  customer_name: string
  kamoku: string
  plan_category: string
  department: string
  staff_name_raw: string
  qty: number
  unit_price: number
  amount_ex_tax: number
  amount_inc_tax: number
  source_row: number
}

export type ParseSalesActualResult = {
  sheet_name: string
  rows: ParsedSalesActualRow[]
  skipped: { source_row: number; reason: string }[]
  kamoku_counts: Record<string, number>
}

const HEADER_ALIASES: Record<keyof Pick<
  ParsedSalesActualRow,
  | 'slip_no'
  | 'billed_on'
  | 'product_code'
  | 'product_name'
  | 'customer_code'
  | 'customer_name'
  | 'kamoku'
  | 'department'
  | 'staff_name_raw'
  | 'qty'
  | 'unit_price'
  | 'amount_ex_tax'
  | 'amount_inc_tax'
>, string[]> = {
  slip_no: ['伝票no', '伝票番号', '伝票ｎｏ'],
  billed_on: ['請求日', '売上日', '伝票日'],
  product_code: ['商品cd', '商品ｃｄ', '商品コード', '品番'],
  product_name: ['商品名', '品名'],
  customer_code: ['得意先cd', '得意先ｃｄ', '得意先コード'],
  customer_name: ['得意先', '得意先名', '顧客名'],
  kamoku: ['科目'],
  department: ['部門'],
  staff_name_raw: ['担当', '担当者'],
  qty: ['数量'],
  unit_price: ['単価'],
  amount_ex_tax: ['税抜金額', '税抜'],
  amount_inc_tax: ['税込金額', '税込'],
}

function normalizeHeader(value: unknown): string {
  return String(value || '')
    .replace(/[\s　]/g, '')
    .replace(/[()（）]/g, '')
    .toLowerCase()
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const s = String(value || '')
    .replace(/,/g, '')
    .replace(/円/g, '')
    .trim()
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function parseBilledOn(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const raw = String(value || '').trim()
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  }
  return null
}

function headerIndexMap(headerRow: unknown[]): Map<string, number> {
  const map = new Map<string, number>()
  headerRow.forEach((cell, idx) => {
    const n = normalizeHeader(cell)
    if (n) map.set(n, idx)
  })
  return map
}

function colIndex(headers: Map<string, number>, aliases: string[]): number {
  for (const alias of aliases) {
    const idx = headers.get(alias)
    if (idx != null) return idx
  }
  return -1
}

function pickSheet(wb: XLSX.WorkBook): { name: string; rows: unknown[][] } | null {
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as unknown[][]
    const header = (rows[0] || []).map((c) => normalizeHeader(c))
    if (header.includes('伝票no') || header.includes('商品cd') || header.includes('科目')) {
      return { name, rows }
    }
  }
  const name = wb.SheetNames[0]
  if (!name) return null
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][]
  return { name, rows }
}

export function parseSalesActualWorkbook(
  buffer: ArrayBuffer,
  fiscalYear: number,
): ParseSalesActualResult {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = pickSheet(wb)
  if (!sheet) {
    return { sheet_name: '', rows: [], skipped: [{ source_row: 0, reason: 'シートがありません' }], kamoku_counts: {} }
  }

  const headerRow = sheet.rows[0] || []
  const headers = headerIndexMap(headerRow)
  const idx = {
    slip_no: colIndex(headers, HEADER_ALIASES.slip_no),
    billed_on: colIndex(headers, HEADER_ALIASES.billed_on),
    product_code: colIndex(headers, HEADER_ALIASES.product_code),
    product_name: colIndex(headers, HEADER_ALIASES.product_name),
    customer_code: colIndex(headers, HEADER_ALIASES.customer_code),
    customer_name: colIndex(headers, HEADER_ALIASES.customer_name),
    kamoku: colIndex(headers, HEADER_ALIASES.kamoku),
    department: colIndex(headers, HEADER_ALIASES.department),
    staff_name_raw: colIndex(headers, HEADER_ALIASES.staff_name_raw),
    qty: colIndex(headers, HEADER_ALIASES.qty),
    unit_price: colIndex(headers, HEADER_ALIASES.unit_price),
    amount_ex_tax: colIndex(headers, HEADER_ALIASES.amount_ex_tax),
    amount_inc_tax: colIndex(headers, HEADER_ALIASES.amount_inc_tax),
  }

  if (idx.kamoku < 0 || idx.amount_ex_tax < 0) {
    return {
      sheet_name: sheet.name,
      rows: [],
      skipped: [{ source_row: 1, reason: 'ヘッダに「科目」または「税抜金額」がありません' }],
      kamoku_counts: {},
    }
  }

  const { from, to } = fiscalYearRange(fiscalYear)
  const skipped: ParseSalesActualResult['skipped'] = []
  const rows: ParsedSalesActualRow[] = []
  const kamoku_counts: Record<string, number> = {}

  for (let i = 1; i < sheet.rows.length; i++) {
    const line = sheet.rows[i] || []
    const source_row = i + 1
    const kamoku = String(idx.kamoku >= 0 ? line[idx.kamoku] : '').trim()
    const plan_category = excelPlanCategoryFor(kamoku)
    if (!plan_category) {
      if (kamoku) skipped.push({ source_row, reason: `科目「${kamoku}」は対象外` })
      continue
    }

    const billed_on = parseBilledOn(idx.billed_on >= 0 ? line[idx.billed_on] : '')
    if (billed_on && (billed_on < from || billed_on > to)) {
      skipped.push({
        source_row,
        reason: `請求日 ${billed_on} は ${fiscalYear}年度の範囲外`,
      })
      continue
    }

    const amount_ex_tax = parseNumber(idx.amount_ex_tax >= 0 ? line[idx.amount_ex_tax] : 0)
    kamoku_counts[kamoku] = (kamoku_counts[kamoku] || 0) + 1
    rows.push({
      slip_no: String(idx.slip_no >= 0 ? line[idx.slip_no] : '').trim(),
      billed_on,
      product_code: String(idx.product_code >= 0 ? line[idx.product_code] : '').trim(),
      product_name: String(idx.product_name >= 0 ? line[idx.product_name] : '').trim(),
      customer_code: String(idx.customer_code >= 0 ? line[idx.customer_code] : '').trim(),
      customer_name: String(idx.customer_name >= 0 ? line[idx.customer_name] : '').trim(),
      kamoku,
      plan_category,
      department: String(idx.department >= 0 ? line[idx.department] : '').trim(),
      staff_name_raw: String(idx.staff_name_raw >= 0 ? line[idx.staff_name_raw] : '').trim(),
      qty: parseNumber(idx.qty >= 0 ? line[idx.qty] : 0),
      unit_price: parseNumber(idx.unit_price >= 0 ? line[idx.unit_price] : 0),
      amount_ex_tax,
      amount_inc_tax: parseNumber(idx.amount_inc_tax >= 0 ? line[idx.amount_inc_tax] : 0),
      source_row,
    })
  }

  return { sheet_name: sheet.name, rows, skipped, kamoku_counts }
}

export function inferFiscalYearFromRows(rows: ParsedSalesActualRow[]): number | null {
  const dates = rows.map((r) => r.billed_on).filter((d): d is string => Boolean(d))
  if (dates.length === 0) return null
  const mid = dates[Math.floor(dates.length / 2)]
  return fiscalYearFromDate(new Date(`${mid}T00:00:00`))
}
