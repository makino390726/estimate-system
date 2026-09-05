import { supabase } from '@/lib/supabaseClient'
import { EXCLUDED_STAFF_IDS } from '@/lib/staffPerformanceSummary'
import {
  CLOSED_CASE_STATUSES,
  LUMP_MACHINE_CODE,
  PROGRESS_CATEGORIES,
  defaultGrossProfit,
  displayPlanCategory,
  formatPlanMachineLabel,
  lineChangeKind,
  progressCategoryFor,
  type PlanChangeKind,
  type PlanConfidence,
} from '@/lib/annualPlanCategories'
import { fiscalYearRange } from '@/lib/annualPlanFiscal'
import { fetchSupabasePages } from '@/lib/supabasePagedFetch'
import { assertPlanMeetsQuotaFloor, fetchOfficeQuotas, staffQuotaAmount } from '@/lib/annualPlanQuota'

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
  customer_name?: string | null
  created_at: string
}

export type StaffOption = {
  id: string
  name: string
  department?: string | null
  branch_id?: string | null
}

export async function fetchPlanStaffs(): Promise<StaffOption[]> {
  const mapRows = (
    rows: Array<{
      id?: string | number | null
      name?: string | null
      department?: string | null
      branch_id?: string | null
    }>,
  ): StaffOption[] =>
    rows
      .map((row) => ({
        id: String(row.id),
        name: String(row.name || ''),
        department: row.department ? String(row.department) : null,
        branch_id: row.branch_id ? String(row.branch_id) : null,
      }))
      .filter((row) => !EXCLUDED_STAFF_IDS.includes(Number(row.id)))

  const full = await supabase
    .from('staffs')
    .select('id, name, is_sales_staff, department, branch_id')
    .eq('is_sales_staff', true)
    .order('name')
  if (!full.error) return mapRows(full.data || [])

  if (!/department|branch_id/i.test(full.error.message)) throw new Error(full.error.message)

  const fallback = await supabase
    .from('staffs')
    .select('id, name, is_sales_staff')
    .eq('is_sales_staff', true)
    .order('name')
  if (fallback.error) throw new Error(fallback.error.message)
  return mapRows(fallback.data || [])
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

export type AnnualPlanChange = {
  line_id: string | null
  action: string
  reason: string | null
  created_at: string
}

export async function fetchPlanChanges(planId: string): Promise<AnnualPlanChange[]> {
  const { data, error } = await supabase
    .from('annual_staff_plan_changes')
    .select('line_id, action, reason, created_at')
    .eq('plan_id', planId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map((row) => ({
    line_id: row.line_id ? String(row.line_id) : null,
    action: String(row.action || ''),
    reason: row.reason ? String(row.reason) : null,
    created_at: String(row.created_at || ''),
  }))
}

/** 行ごとの最新の変更理由。数量保存時の定型「中間修正」は除外 */
export function latestChangeReasonByLine(changes: AnnualPlanChange[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of changes) {
    const id = String(c.line_id || '')
    const reason = String(c.reason || '').trim()
    if (!id || !reason || reason === '中間修正' || out[id]) continue
    out[id] = reason
  }
  return out
}

export function displayPlanLineMachine(line: Pick<AnnualPlanLine, 'machine_code' | 'machine_name'>): string {
  return formatPlanMachineLabel(String(line.machine_code || '').trim(), line.machine_name)
}

function normalizePlanRemarks(value: string | null | undefined): string | null {
  const s = String(value || '').trim()
  return s || null
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
  customer_name?: string | null
  reason?: string
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
      customer_name: normalizePlanRemarks(input.customer_name),
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  await supabase.from('annual_staff_plan_changes').insert({
    plan_id: input.planId,
    line_id: data.id,
    action: 'add',
    reason: input.reason || null,
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

export async function updatePlanLineCustomerName(
  planId: string,
  line: AnnualPlanLine,
  customerName: string | null,
): Promise<AnnualPlanLine> {
  const next = normalizePlanRemarks(customerName)
  const prev = normalizePlanRemarks(line.customer_name)
  if (prev === next) return line
  const lineId = String(line.id)
  const { data, error } = await supabase
    .from('annual_staff_plan_lines')
    .update({
      customer_name: next,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lineId)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('備考の保存に失敗しました。行が見つかりません。')

  const { error: logError } = await supabase.from('annual_staff_plan_changes').insert({
    plan_id: planId,
    line_id: lineId,
    action: 'remark',
    old_payload: { customer_name: prev },
    new_payload: { customer_name: next },
    actor_name: 'web',
  })
  if (logError) {
    console.warn('annual plan remark log:', logError.message)
  }
  return data as AnnualPlanLine
}

export async function updatePlanLineQtyAmount(
  planId: string,
  line: AnnualPlanLine,
  qty: number,
  amount: number,
  reason?: string,
): Promise<AnnualPlanLine> {
  const nextAmount = Math.round(Number(amount) || 0)
  const nextQty = Number.isFinite(qty) && qty > 0 ? qty : 0
  const lineId = String(line.id)
  const { data, error } = await supabase
    .from('annual_staff_plan_lines')
    .update({
      qty: nextQty,
      amount: nextAmount,
      gross_profit: defaultGrossProfit(nextAmount),
      updated_at: new Date().toISOString(),
    })
    .eq('id', lineId)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('計画行の保存に失敗しました。行が見つかりません。')

  const { error: logError } = await supabase.from('annual_staff_plan_changes').insert({
    plan_id: planId,
    line_id: lineId,
    action: 'revise',
    reason: reason || null,
    old_payload: { qty: line.qty, amount: line.amount, gross_profit: line.gross_profit },
    new_payload: { qty: nextQty, amount: nextAmount, gross_profit: defaultGrossProfit(nextAmount) },
    actor_name: 'web',
  })
  if (logError) {
    console.warn('annual plan revise log:', logError.message)
  }
  return data as AnnualPlanLine
}

export async function updatePlanLineConfidence(
  planId: string,
  line: AnnualPlanLine,
  confidence: PlanConfidence,
): Promise<AnnualPlanLine> {
  if (line.confidence === confidence) return line
  const lineId = String(line.id)
  const { data, error } = await supabase
    .from('annual_staff_plan_lines')
    .update({
      confidence,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lineId)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('確度の保存に失敗しました。行が見つかりません。')

  const { error: logError } = await supabase.from('annual_staff_plan_changes').insert({
    plan_id: planId,
    line_id: lineId,
    action: 'confidence',
    old_payload: { confidence: line.confidence },
    new_payload: { confidence },
    actor_name: 'web',
  })
  if (logError) {
    console.warn('annual plan confidence log:', logError.message)
  }
  return data as AnnualPlanLine
}

export async function confirmPlan(plan: AnnualPlan, lines: AnnualPlanLine[], reason?: string): Promise<AnnualPlan> {
  const amount = lines.reduce((s, r) => s + Number(r.amount || 0), 0)
  const gp = lines.reduce((s, r) => s + Number(r.gross_profit || 0), 0)
  const quotas = await fetchOfficeQuotas(plan.fiscal_year).catch(() => null)
  if (quotas) {
    assertPlanMeetsQuotaFloor(amount, staffQuotaAmount(quotas.allocations, plan.staff_id))
  }
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
  const { from: dateFrom, to: dateTo } = fiscalYearRange(fiscalYear)
  const rows = await fetchSupabasePages<{ staff_id: string | null; total_amount: number | null }>({
    count: async () => {
      const { count, error } = await supabase
        .from('cases')
        .select('case_id', { count: 'exact', head: true })
        .in('status', [...CLOSED_CASE_STATUSES])
        .gte('created_date', `${dateFrom}T00:00:00`)
        .lte('created_date', `${dateTo}T23:59:59.999`)
      if (error) throw new Error(error.message)
      return count || 0
    },
    page: async (from, to) => {
      const { data, error } = await supabase
        .from('cases')
        .select('staff_id, total_amount')
        .in('status', [...CLOSED_CASE_STATUSES])
        .gte('created_date', `${dateFrom}T00:00:00`)
        .lte('created_date', `${dateTo}T23:59:59.999`)
        .order('case_id', { ascending: true })
        .range(from, to)
      if (error) throw new Error(error.message)
      return data || []
    },
  })

  const stats = new Map<string, { amount: number; count: number }>()
  for (const row of rows) {
    const staffId = String(row.staff_id ?? '')
    if (!staffId) continue
    const prev = stats.get(staffId) || { amount: 0, count: 0 }
    prev.amount += Number(row.total_amount || 0)
    prev.count += 1
    stats.set(staffId, prev)
  }
  return stats
}

export type SalesActualSummary = {
  byStaff: Record<string, number>
  byCategory: Record<string, number>
  byStaffCategory: Record<string, Record<string, number>>
  byOffice: Record<string, number>
  byOfficeCategory: Record<string, Record<string, number>>
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
    byStaffCategory: json.byStaffCategory || {},
    byOffice: json.byOffice || {},
    byOfficeCategory: json.byOfficeCategory || {},
    unmatchedAmount: Number(json.unmatchedAmount || 0),
    totalAmount: Number(json.totalAmount || 0),
    import: json.import || null,
  }
}

export async function fetchItemMonthProgress(fiscalYear: number, staffId: string) {
  const res = await fetch(
    `/api/plan/annual/item-progress?fy=${fiscalYear}&staff=${encodeURIComponent(staffId)}`,
  )
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json.error || '品名別月次進捗の取得に失敗しました')
  }
  return json as import('@/lib/annualPlanItemProgress').ItemMonthProgressResult & { ok?: boolean }
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
    amount_ex_tax_total?: number
  }
}

export function formatPlanDbError(message: string): string {
  if (/is_sales_staff/i.test(message)) {
    return `営業担当者フラグがありません。見積システムの Supabase で add_staff_is_sales.sql を実行してください。詳細: ${message}`
  }
  if (/change_kind/i.test(message)) {
    return `計画行の区分列がありません。見積システムの Supabase で create_annual_plan_line_change_kind.sql を実行してください。詳細: ${message}`
  }
  const missing =
    /could not find the table/i.test(message) ||
    /schema cache/i.test(message) ||
    /does not exist/i.test(message)
  if (missing) {
    if (/annual_office_quota/i.test(message) || /ノルマ/i.test(message)) {
      return `営業所ノルマのテーブルが見つかりません。見積システムの Supabase で create_annual_office_quota_tables.sql を実行してください。詳細: ${message}`
    }
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

export function planLineItemKey(line: Pick<AnnualPlanLine, 'category' | 'machine_code' | 'machine_name'>) {
  const code = String(line.machine_code || '').trim() || LUMP_MACHINE_CODE
  const name = String(line.machine_name || '').trim()
  return `${displayPlanCategory(line.category)}::${code}::${name}`
}

/** 中間修正がある品名は、中間計画では当初行の代わりに中間行を使う */
export function currentPlanLines(lines: AnnualPlanLine[]): AnnualPlanLine[] {
  const interimLines = lines.filter((l) => lineChangeKind(l) === 'interim')
  const superseded = new Set(interimLines.map(planLineItemKey))
  return [
    ...lines.filter((l) => lineChangeKind(l) === 'initial' && !superseded.has(planLineItemKey(l))),
    ...interimLines,
  ]
}

export function splitPlanTotals(lines: AnnualPlanLine[]) {
  const initialLines = lines.filter((l) => lineChangeKind(l) === 'initial')
  const interimLines = lines.filter((l) => lineChangeKind(l) === 'interim')
  return {
    initial: lineTotals(initialLines),
    interim: lineTotals(interimLines),
    current: lineTotals(currentPlanLines(lines)),
  }
}

export function initialLineTotalsByCategory(lines: AnnualPlanLine[]) {
  const initialLines = lines.filter((l) => lineChangeKind(l) === 'initial')
  const currentLines = currentPlanLines(lines)
  const rows = PROGRESS_CATEGORIES.map((cat) => {
    const initial = lineTotals(initialLines.filter((l) => progressCategoryFor(l.category) === cat))
    const current = lineTotals(currentLines.filter((l) => progressCategoryFor(l.category) === cat))
    const hasInterim = lines.some(
      (l) => lineChangeKind(l) === 'interim' && progressCategoryFor(l.category) === cat,
    )
    return {
      cat,
      label: cat === '生産品' ? '生産品' : cat,
      initial,
      current,
      hasInterim,
    }
  })
  return {
    rows,
    grandInitial: lineTotals(initialLines),
    grandCurrent: lineTotals(currentLines),
  }
}
