import { supabase } from '@/lib/supabaseClient'
import { fetchLostStatsByStaff } from '@/lib/staffPerformanceLost'

export type StaffSummary = {
  staff_id: number
  staff_name: string | null
  total_count: number
  total_amount: number
  negotiating_count: number
  negotiating_amount: number
  lost_count: number
  lost_amount: number
  contracted_count: number
  contracted_amount: number
  gross_profit_total: number
  contract_rate: number | null
  avg_gross_margin: number | null
}

export type StaffPerformanceTotals = {
  total_count: number
  total_amount: number
  negotiating_count: number
  negotiating_amount: number
  lost_count: number
  lost_amount: number
  contracted_count: number
  contracted_amount: number
  gross_profit_total: number
  contract_rate: number | null
  avg_gross_margin: number | null
}

export const EXCLUDED_STAFF_IDS = [99, 100]

export function enrichStaffRows(rows: StaffSummary[]): StaffSummary[] {
  return rows.map((row) => ({
    ...row,
    contract_rate:
      row.total_amount > 0 ? (row.contracted_amount / row.total_amount) * 100 : null,
    avg_gross_margin:
      row.contracted_amount > 0
        ? (row.gross_profit_total / row.contracted_amount) * 100
        : null,
  }))
}

export function filterStaffRows(rows: StaffSummary[]): StaffSummary[] {
  return rows.filter((row) => !EXCLUDED_STAFF_IDS.includes(row.staff_id))
}

export function computeStaffPerformanceTotals(rows: StaffSummary[]): StaffPerformanceTotals {
  const total = {
    total_count: 0,
    total_amount: 0,
    negotiating_count: 0,
    negotiating_amount: 0,
    lost_count: 0,
    lost_amount: 0,
    contracted_count: 0,
    contracted_amount: 0,
    gross_profit_total: 0,
  }

  rows.forEach((row) => {
    total.total_count += row.total_count
    total.total_amount += row.total_amount
    total.negotiating_count += row.negotiating_count
    total.negotiating_amount += row.negotiating_amount
    total.lost_count += row.lost_count
    total.lost_amount += row.lost_amount
    total.contracted_count += row.contracted_count
    total.contracted_amount += row.contracted_amount
    total.gross_profit_total += row.gross_profit_total
  })

  return {
    ...total,
    contract_rate:
      total.total_amount > 0
        ? (total.contracted_amount / total.total_amount) * 100
        : null,
    avg_gross_margin:
      total.contracted_amount > 0
        ? (total.gross_profit_total / total.contracted_amount) * 100
        : null,
  }
}

export async function fetchStaffPerformanceSummary(
  fromDate?: string,
  toDate?: string,
): Promise<StaffSummary[]> {
  const { data, error } = await supabase.rpc('get_staff_performance_summary', {
    _from: fromDate || null,
    _to: toDate || null,
  })

  if (error) {
    throw new Error(error.message || 'データ取得エラー')
  }

  const lostStatsByStaff = await fetchLostStatsByStaff(
    supabase,
    fromDate || null,
    toDate || null,
  )

  const rows = (data || []).map((row: any) => {
    const staffId = Number(row.staff_id)
    const lostStats = lostStatsByStaff.get(staffId)

    return {
      staff_id: row.staff_id,
      staff_name: row.staff_name,
      total_count: row.total_deal_count ?? 0,
      total_amount: row.total_deal_amount ?? 0,
      negotiating_count: row.negotiating_count ?? 0,
      negotiating_amount: row.negotiating_amount ?? 0,
      lost_count: row.lost_count ?? lostStats?.lost_count ?? 0,
      lost_amount: row.lost_amount ?? lostStats?.lost_amount ?? 0,
      contracted_count: row.ordered_count ?? 0,
      contracted_amount: row.ordered_amount ?? 0,
      gross_profit_total: row.gross_profit_total ?? 0,
      contract_rate: null,
      avg_gross_margin: null,
    } satisfies StaffSummary
  })

  return enrichStaffRows(filterStaffRows(rows))
}

export function formatYenShort(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}億`
  if (value >= 10000) return `${Math.round(value / 10000).toLocaleString('ja-JP')}万`
  return value.toLocaleString('ja-JP')
}
