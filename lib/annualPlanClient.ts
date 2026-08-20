import { supabase } from '@/lib/supabaseClient'
import { EXCLUDED_STAFF_IDS } from '@/lib/staffPerformanceSummary'
import {
  CLOSED_CASE_STATUSES,
  LUMP_MACHINE_CODE,
  defaultGrossProfit,
  lineChangeKind,
  type PlanChangeKind,
  type PlanConfidence,
} from '@/lib/annualPlanCategories'
import { fiscalYearRange } from '@/lib/annualPlanFiscal'

export type AnnualPlan = {
  id: string
  fiscal_year: number
  staff_id: string
  status: 'draft' | 'confirmed'
  initial_amount: number | null
  initial_gross_profit: number | null
  confirmed_at: string | null
}

export type AnnualPlanLine = {
  id: string
  plan_id: string
  category: string
  machine_code: string
  machine_name: string | null
  machine_source: 'factory' | 'product'
  qty: number
  amount: number
  gross_profit: number
  confidence: PlanConfidence
  change_kind?: PlanChangeKind | null
  created_at: string
}

export type StaffOption = { id: string; name: string }

export async function fetchPlanStaffs(): Promise<StaffOption[]> {
  const { data, error } = await supabase.from('staffs').select('id, name').order('name')
  if (error) throw new Error(error.message)
  return (data || [])
    .map((row) => ({ id: String(row.id), name: String(row.name || '') }))
    .filter((row) => !EXCLUDED_STAFF_IDS.includes(Number(row.id)))
}

export async function getOrCreatePlan(fiscalYear: number, staffId: string): Promise<AnnualPlan> {
  const { data: existing, error: readError } = await supabase
    .from('annual_staff_plans')
    .select('*')
    .eq('fiscal_year', fiscalYear)
    .eq('staff_id', staffId)
    .maybeSingle()
  if (readError) throw new Error(readError.message)
  if (existing) return existing as AnnualPlan

  const { data: created, error: insertError } = await supabase
    .from('annual_staff_plans')
    .insert({ fiscal_year: fiscalYear, staff_id: staffId, status: 'draft' })
    .select('*')
    .single()
  if (insertError) throw new Error(insertError.message)
  return created as AnnualPlan
}

export async function fetchPlanLines(planId: string): Promise<AnnualPlanLine[]> {
  const { data, error } = await supabase
    .from('annual_staff_plan_lines')
    .select('*')
    .eq('plan_id', planId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || []) as AnnualPlanLine[]
}

export function displayPlanLineMachine(line: Pick<AnnualPlanLine, 'machine_code' | 'machine_name'>): string {
  if (line.machine_code === LUMP_MACHINE_CODE) {
    return String(line.machine_name || '').trim() || '—'
  }
  const code = String(line.machine_code || '').trim()
  const name = String(line.machine_name || '').trim()
  if (!code) return name || '—'
  if (name && name !== code) return `${code} ${name}`
  return code || name || '—'
}

export async function addPlanLine(input: {
  planId: string
  category: string
  machine_code?: string
  machine_name?: string | null
  machine_source: 'factory' | 'product'
  qty: number
  amount: number
  confidence: PlanConfidence
  gross_profit?: number
  change_kind?: PlanChangeKind
}): Promise<AnnualPlanLine> {
  const machineCode = String(input.machine_code || '').trim() || LUMP_MACHINE_CODE
  const changeKind: PlanChangeKind = input.change_kind === 'interim' ? 'interim' : 'initial'
  const { data, error } = await supabase
    .from('annual_staff_plan_lines')
    .insert({
      plan_id: input.planId,
      category: input.category,
      machine_code: machineCode,
      machine_name: input.machine_name || null,
      machine_source: input.machine_source,
      qty: input.qty,
      amount: input.amount,
      gross_profit: input.gross_profit ?? defaultGrossProfit(input.amount),
      confidence: input.confidence,
      change_kind: changeKind,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  await supabase.from('annual_staff_plan_changes').insert({
    plan_id: input.planId,
    line_id: data.id,
    action: 'add',
    new_payload: data,
    actor_name: 'web',
  })
  return data as AnnualPlanLine
}

export async function deletePlanLine(planId: string, lineId: string, reason?: string): Promise<void> {
  const { data: oldRow } = await supabase
    .from('annual_staff_plan_lines')
    .select('*')
    .eq('id', lineId)
    .maybeSingle()

  const { error } = await supabase.from('annual_staff_plan_lines').delete().eq('id', lineId)
  if (error) throw new Error(error.message)

  await supabase.from('annual_staff_plan_changes').insert({
    plan_id: planId,
    line_id: lineId,
    action: 'delete',
    reason: reason || null,
    old_payload: oldRow,
    actor_name: 'web',
  })
}

export async function updateLineChangeKind(
  planId: string,
  line: AnnualPlanLine,
  changeKind: PlanChangeKind,
  reason?: string,
): Promise<AnnualPlanLine> {
  const { data, error } = await supabase
    .from('annual_staff_plan_lines')
    .update({ change_kind: changeKind, updated_at: new Date().toISOString() })
    .eq('id', line.id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  await supabase.from('annual_staff_plan_changes').insert({
    plan_id: planId,
    line_id: line.id,
    action: 'retag',
    reason: reason || null,
    old_payload: { change_kind: lineChangeKind(line) },
    new_payload: { change_kind: changeKind },
    actor_name: 'web',
  })
  return data as AnnualPlanLine
}

export async function confirmPlan(plan: AnnualPlan, lines: AnnualPlanLine[], reason?: string): Promise<AnnualPlan> {
  const amount = lines.reduce((s, r) => s + Number(r.amount || 0), 0)
  const gp = lines.reduce((s, r) => s + Number(r.gross_profit || 0), 0)
  const { data, error } = await supabase
    .from('annual_staff_plans')
    .update({
      status: 'confirmed',
      initial_amount: amount,
      initial_gross_profit: gp,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', plan.id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  await supabase.from('annual_staff_plan_changes').insert({
    plan_id: plan.id,
    action: plan.status === 'confirmed' ? 'reconfirm' : 'confirm',
    reason: reason || null,
    old_payload: {
      initial_amount: plan.initial_amount,
      initial_gross_profit: plan.initial_gross_profit,
    },
    new_payload: { initial_amount: amount, initial_gross_profit: gp },
    actor_name: 'web',
  })
  return data as AnnualPlan
}

export async function fetchAllPlansForYear(fiscalYear: number): Promise<AnnualPlan[]> {
  const { data, error } = await supabase
    .from('annual_staff_plans')
    .select('*')
    .eq('fiscal_year', fiscalYear)
  if (error) throw new Error(error.message)
  return (data || []) as AnnualPlan[]
}

export async function fetchAllLinesForPlans(planIds: string[]): Promise<AnnualPlanLine[]> {
  if (planIds.length === 0) return []
  const { data, error } = await supabase
    .from('annual_staff_plan_lines')
    .select('*')
    .in('plan_id', planIds)
  if (error) throw new Error(error.message)
  return (data || []) as AnnualPlanLine[]
}

/** 見積成約: ステータスが受注・注文・完了。作成日が年度内 */
export async function fetchClosedAmountByStaff(
  fiscalYear: number,
): Promise<Map<string, { amount: number; count: number }>> {
  const { from, to } = fiscalYearRange(fiscalYear)
  const stats = new Map<string, { amount: number; count: number }>()
  const pageSize = 1000
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('cases')
      .select('staff_id, total_amount')
      .in('status', [...CLOSED_CASE_STATUSES])
      .gte('created_date', `${from}T00:00:00`)
      .lte('created_date', `${to}T23:59:59.999`)
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(error.message)
    const rows = data || []
    for (const row of rows) {
      const staffId = String(row.staff_id ?? '')
      if (!staffId) continue
      const prev = stats.get(staffId) || { amount: 0, count: 0 }
      prev.amount += Number(row.total_amount || 0)
      prev.count += 1
      stats.set(staffId, prev)
    }
    if (rows.length < pageSize) break
    offset += pageSize
  }

  return stats
}

export type SalesActualSummary = {
  byStaff: Record<string, number>
  byCategory: Record<string, number>
  unmatchedAmount: number
  totalAmount: number
  import: {
    file_name: string | null
    sheet_name: string | null
    row_count: number
    skipped_count: number
    unmatched_staff_count: number
    imported_at: string | null
  } | null
}

export async function fetchSalesActualSummary(fiscalYear: number): Promise<SalesActualSummary> {
  const res = await fetch(`/api/plan/annual/sales-actuals?fy=${fiscalYear}`)
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json.error || '売上実績の取得に失敗しました')
  }
  return {
    byStaff: json.byStaff || {},
    byCategory: json.byCategory || {},
    unmatchedAmount: Number(json.unmatchedAmount || 0),
    totalAmount: Number(json.totalAmount || 0),
    import: json.import || null,
  }
}

export async function importSalesActualExcel(fiscalYear: number, file: File) {
  const body = new FormData()
  body.set('file', file)
  body.set('fiscal_year', String(fiscalYear))
  const res = await fetch('/api/plan/annual/import-sales', { method: 'POST', body })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json.error || '売上Excelの取込に失敗しました')
  }
  return json as {
    inserted: number
    unmatched_staff: number
    skipped_count: number
  }
}

export function formatPlanDbError(message: string): string {
  if (/change_kind/i.test(message)) {
    return `計画行の区分列がありません。見積システムの Supabase で create_annual_plan_line_change_kind.sql を実行してください。詳細: ${message}`
  }
  const missing =
    /could not find the table/i.test(message) ||
    /schema cache/i.test(message) ||
    /does not exist/i.test(message)
  if (missing) {
    if (/annual_sales_actual/i.test(message) || /売上実績/i.test(message)) {
      return `売上実績テーブルが見つかりません。見積システムの Supabase で create_annual_sales_actual_tables.sql を実行してください。詳細: ${message}`
    }
    return `計画テーブルが見つかりません。見積システムの Supabase（factory-materials ではない）で create_annual_plan_tables.sql を実行してください。詳細: ${message}`
  }
  return message
}

export function lineTotals(lines: AnnualPlanLine[]) {
  return {
    amount: lines.reduce((s, r) => s + Number(r.amount || 0), 0),
    gp: lines.reduce((s, r) => s + Number(r.gross_profit || 0), 0),
    qty: lines.reduce((s, r) => s + Number(r.qty || 0), 0),
    weighted: lines.reduce((s, r) => {
      const w = r.confidence === 'high' ? 1 : r.confidence === 'mid' ? 0.5 : 0
      return s + Number(r.amount || 0) * w
    }, 0),
  }
}

export function splitPlanTotals(lines: AnnualPlanLine[]) {
  const initialLines = lines.filter((l) => lineChangeKind(l) === 'initial')
  const interimLines = lines.filter((l) => lineChangeKind(l) === 'interim')
  return {
    initial: lineTotals(initialLines),
    interim: lineTotals(interimLines),
    current: lineTotals(lines),
  }
}
