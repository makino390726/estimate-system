export type CaseDetailAmountRow = {
  amount: number
  quantity: number
  unit_price: number | null
  cost_unit_price: number | null
  cost_amount?: number | null
  gross_profit?: number | null
  product_cost_price?: number | null
  exclude_from_total?: boolean | null
}

export type CaseDetailReportRow = {
  created_date: string
  subject: string
  business_total: number
  cost_total: number
  gross_profit_total: number
  gross_profit_rate: number | null
  status: string
  staff_name: string
}

export type CaseAmountFallback = {
  businessTotal?: number | null
  grossProfitTotal?: number | null
}

function lineAmount(row: CaseDetailAmountRow): number {
  if (row.exclude_from_total) return 0
  const stored = Number(row.amount || 0)
  if (stored !== 0) return stored
  return Number(row.unit_price ?? 0) * Number(row.quantity ?? 0)
}

function lineCost(row: CaseDetailAmountRow): number {
  const quantity = Number(row.quantity || 0)
  if (row.exclude_from_total) {
    return Number(row.unit_price ?? 0) * quantity
  }

  const storedCostAmount = Number(row.cost_amount ?? 0)
  if (storedCostAmount !== 0) return storedCostAmount

  const costUnitPrice = Number(row.cost_unit_price ?? row.product_cost_price ?? 0)
  return costUnitPrice * quantity
}

function lineGrossProfit(row: CaseDetailAmountRow): number {
  const stored = row.gross_profit
  if (stored != null && Number(stored) !== 0) return Number(stored)
  return lineAmount(row) - lineCost(row)
}

export function computeCaseAmounts(
  details: CaseDetailAmountRow[],
  fallback?: CaseAmountFallback,
): {
  businessTotal: number
  costTotal: number
  grossProfitTotal: number
  grossProfitRate: number | null
} {
  let businessTotal = details.reduce((sum, row) => sum + lineAmount(row), 0)
  let costTotal = details.reduce((sum, row) => sum + lineCost(row), 0)
  let grossProfitTotal = details.reduce((sum, row) => sum + lineGrossProfit(row), 0)

  const fallbackBusiness = Number(fallback?.businessTotal ?? 0)
  const fallbackGross = Number(fallback?.grossProfitTotal ?? 0)

  if (businessTotal === 0 && fallbackBusiness !== 0) {
    businessTotal = fallbackBusiness
  }
  if (grossProfitTotal === 0 && fallbackGross !== 0) {
    grossProfitTotal = fallbackGross
  }
  if (costTotal === 0 && businessTotal !== 0 && grossProfitTotal !== 0) {
    costTotal = businessTotal - grossProfitTotal
  }

  const grossProfitRate =
    businessTotal > 0 ? (grossProfitTotal / businessTotal) * 100 : null

  return {
    businessTotal,
    costTotal,
    grossProfitTotal,
    grossProfitRate,
  }
}

export function formatReportDate(value: string | null | undefined): string {
  if (!value) return '-'
  return value.split('T')[0]
}

export function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString('ja-JP')} 円`
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return `${value.toFixed(1)}%`
}

export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '""'
  const stringValue = String(value).replace(/"/g, '""')
  return `"${stringValue}"`
}

export function buildCaseDetailReportCsv(rows: CaseDetailReportRow[]): string {
  const header = ['作成日', '件名', '事業費計', '原価合計', '粗利額計', '粗利率', 'ステータス', '担当者']
  const body = rows.map((row) => [
    formatReportDate(row.created_date),
    row.subject,
    row.business_total,
    row.cost_total,
    row.gross_profit_total,
    row.gross_profit_rate != null ? `${row.gross_profit_rate.toFixed(1)}%` : '',
    row.status,
    row.staff_name,
  ])

  const totals = rows.reduce(
    (acc, row) => ({
      business_total: acc.business_total + row.business_total,
      cost_total: acc.cost_total + row.cost_total,
      gross_profit_total: acc.gross_profit_total + row.gross_profit_total,
    }),
    { business_total: 0, cost_total: 0, gross_profit_total: 0 },
  )

  const totalRate =
    totals.business_total > 0
      ? `${((totals.gross_profit_total / totals.business_total) * 100).toFixed(1)}%`
      : ''

  body.push([
    '合計',
    '',
    totals.business_total,
    totals.cost_total,
    totals.gross_profit_total,
    totalRate,
    '',
    '',
  ])

  return [header, ...body]
    .map((line) => line.map(escapeCsv).join(','))
    .join('\r\n')
}

const DETAIL_SELECT =
  'case_id, product_id, amount, quantity, unit_price, cost_unit_price, cost_amount, gross_profit, exclude_from_total'

type SupabaseLike = {
  from: (table: string) => any
}

export async function fetchCaseDetailsForReport(
  supabase: SupabaseLike,
  caseIds: string[],
): Promise<any[]> {
  if (caseIds.length === 0) return []

  const allDetails: any[] = []
  const caseChunkSize = 40
  const pageSize = 1000

  for (let i = 0; i < caseIds.length; i += caseChunkSize) {
    const caseChunk = caseIds.slice(i, i + caseChunkSize)
    let offset = 0

    while (true) {
      const { data, error } = await supabase
        .from('case_details')
        .select(DETAIL_SELECT)
        .in('case_id', caseChunk)
        .range(offset, offset + pageSize - 1)

      if (error) {
        throw new Error(error.message || '明細データの取得に失敗しました')
      }

      const rows = data || []
      allDetails.push(...rows)

      if (rows.length < pageSize) break
      offset += pageSize
    }
  }

  return allDetails
}

export async function fetchProductCostMap(
  supabase: SupabaseLike,
  productIds: string[],
): Promise<Map<string, number>> {
  const costMap = new Map<string, number>()
  if (productIds.length === 0) return costMap

  const chunkSize = 200
  for (let i = 0; i < productIds.length; i += chunkSize) {
    const chunk = productIds.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('products')
      .select('id, cost_price')
      .in('id', chunk)

    if (error) {
      throw new Error(error.message || '商品マスタの取得に失敗しました')
    }

    ;(data || []).forEach((product: any) => {
      costMap.set(String(product.id), Number(product.cost_price || 0))
    })
  }

  return costMap
}

export function mapDetailRowsForReport(
  detailData: any[],
  productCostMap: Map<string, number>,
): Map<string, CaseDetailAmountRow[]> {
  const groupedDetails = new Map<string, CaseDetailAmountRow[]>()

  detailData.forEach((detail) => {
    const productId = detail.product_id != null ? String(detail.product_id) : ''
    const list = groupedDetails.get(detail.case_id) || []
    list.push({
      amount: Number(detail.amount || 0),
      quantity: Number(detail.quantity || 0),
      unit_price: detail.unit_price != null ? Number(detail.unit_price) : null,
      cost_unit_price: detail.cost_unit_price != null ? Number(detail.cost_unit_price) : null,
      cost_amount: detail.cost_amount != null ? Number(detail.cost_amount) : null,
      gross_profit: detail.gross_profit != null ? Number(detail.gross_profit) : null,
      product_cost_price: productId ? productCostMap.get(productId) ?? null : null,
      exclude_from_total: detail.exclude_from_total ?? false,
    })
    groupedDetails.set(detail.case_id, list)
  })

  return groupedDetails
}

export function deriveBusinessFallback(totalAmount: unknown): number {
  const value = Number(totalAmount || 0)
  return Number.isFinite(value) ? value : 0
}

export function deriveGrossProfitFallback(
  grossProfit: unknown,
  totalAmount: unknown,
  grossMargin: unknown,
): number {
  const direct = Number(grossProfit || 0)
  if (Number.isFinite(direct) && direct !== 0) return direct

  const amount = Number(totalAmount || 0)
  const margin = Number(grossMargin || 0)
  if (Number.isFinite(amount) && Number.isFinite(margin) && amount !== 0 && margin !== 0) {
    return Math.round(amount * margin)
  }

  return 0
}
