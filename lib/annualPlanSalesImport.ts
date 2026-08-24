import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedSalesActualRow } from '@/lib/annualPlanSalesExcel'
import { resolveExcelStaffId, type PlanStaffMatch } from '@/lib/annualPlanStaffMatch'
import { EXCLUDED_STAFF_IDS } from '@/lib/staffPerformanceSummary'

export async function fetchStaffsForExcelMatch(sb: SupabaseClient): Promise<PlanStaffMatch[]> {
  const { data, error } = await sb.from('staffs').select('id, name')
  if (error) throw new Error(error.message)
  return (data || [])
    .map((row) => ({ id: String(row.id), name: String(row.name || '') }))
    .filter((row) => row.name && !EXCLUDED_STAFF_IDS.includes(Number(row.id)))
}

/** 取込済みで staff_id が空の行を、現行の氏名照合で付け直す */
export async function rematchUnmatchedSalesActualStaff(
  sb: SupabaseClient,
  fiscalYear: number,
  staffs: PlanStaffMatch[],
): Promise<{ updated: number; stillUnmatched: number }> {
  const { count, error: countError } = await sb
    .from('annual_sales_actual_lines')
    .select('id', { count: 'exact', head: true })
    .eq('fiscal_year', fiscalYear)
    .is('staff_id', null)
  if (countError) throw new Error(countError.message)
  if (!count) return { updated: 0, stillUnmatched: 0 }

  const pageSize = 1000
  let offset = 0
  const byRaw = new Map<string, string[]>()

  while (true) {
    const { data, error } = await sb
      .from('annual_sales_actual_lines')
      .select('id, staff_name_raw')
      .eq('fiscal_year', fiscalYear)
      .is('staff_id', null)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(error.message)
    const rows = data || []
    for (const row of rows) {
      const raw = String(row.staff_name_raw || '').trim()
      if (!raw) continue
      const ids = byRaw.get(raw) || []
      ids.push(String(row.id))
      byRaw.set(raw, ids)
    }
    if (rows.length < pageSize) break
    offset += pageSize
  }

  let updated = 0
  for (const [raw, ids] of byRaw) {
    const staffId = resolveExcelStaffId(raw, staffs)
    if (!staffId) continue
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const { error } = await sb
        .from('annual_sales_actual_lines')
        .update({ staff_id: staffId })
        .in('id', chunk)
      if (error) throw new Error(error.message)
      updated += chunk.length
    }
  }

  const stillUnmatched = [...byRaw.values()].reduce((n, ids) => n + ids.length, 0) - updated
  const { data: latest } = await sb
    .from('annual_sales_actual_imports')
    .select('id')
    .eq('fiscal_year', fiscalYear)
    .order('imported_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latest?.id) {
    await sb
      .from('annual_sales_actual_imports')
      .update({ unmatched_staff_count: stillUnmatched })
      .eq('id', latest.id)
  }

  return { updated, stillUnmatched }
}

export type SalesActualImportResult = {
  import_id: string
  fiscal_year: number
  inserted: number
  unmatched_staff: number
  deleted_previous: number
}

export async function replaceSalesActualsForYear(
  sb: SupabaseClient,
  input: {
    fiscalYear: number
    fileName: string
    sheetName: string
    skippedCount: number
    rows: ParsedSalesActualRow[]
    staffs: PlanStaffMatch[]
  },
): Promise<SalesActualImportResult> {
  const { data: previous, error: prevError } = await sb
    .from('annual_sales_actual_imports')
    .select('id')
    .eq('fiscal_year', input.fiscalYear)
  if (prevError) throw new Error(prevError.message)
  const previousIds = (previous || []).map((r) => String(r.id))

  if (previousIds.length > 0) {
    const { error: delError } = await sb
      .from('annual_sales_actual_imports')
      .delete()
      .in('id', previousIds)
    if (delError) throw new Error(delError.message)
  }

  let unmatched_staff = 0
  const payload = input.rows.map((row) => {
    const staff_id = resolveExcelStaffId(row.staff_name_raw, input.staffs)
    if (row.staff_name_raw && !staff_id) unmatched_staff += 1
    return {
      fiscal_year: input.fiscalYear,
      slip_no: row.slip_no || null,
      billed_on: row.billed_on,
      product_code: row.product_code || null,
      product_name: row.product_name || null,
      customer_code: row.customer_code || null,
      customer_name: row.customer_name || null,
      kamoku: row.kamoku,
      plan_category: row.plan_category,
      department: row.department || null,
      staff_name_raw: row.staff_name_raw || null,
      staff_id,
      qty: row.qty,
      unit_price: row.unit_price,
      amount_ex_tax: row.amount_ex_tax,
      amount_inc_tax: row.amount_inc_tax,
      source_row: row.source_row,
    }
  })

  const { data: created, error: importError } = await sb
    .from('annual_sales_actual_imports')
    .insert({
      fiscal_year: input.fiscalYear,
      file_name: input.fileName,
      sheet_name: input.sheetName,
      row_count: payload.length,
      skipped_count: input.skippedCount,
      unmatched_staff_count: unmatched_staff,
    })
    .select('id')
    .single()
  if (importError) throw new Error(importError.message)
  const import_id = String(created.id)

  const chunkSize = 500
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize).map((row) => ({ ...row, import_id }))
    const { error } = await sb.from('annual_sales_actual_lines').insert(chunk)
    if (error) throw new Error(error.message)
  }

  return {
    import_id,
    fiscal_year: input.fiscalYear,
    inserted: payload.length,
    unmatched_staff,
    deleted_previous: previousIds.length,
  }
}
