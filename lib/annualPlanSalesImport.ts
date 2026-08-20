import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedSalesActualRow } from '@/lib/annualPlanSalesExcel'
import { resolveExcelStaffId, type PlanStaffMatch } from '@/lib/annualPlanStaffMatch'

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
