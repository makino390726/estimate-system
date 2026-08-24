import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchStaffsForExcelMatch } from '@/lib/annualPlanSalesImport'
import { resolveExcelStaffId } from '@/lib/annualPlanStaffMatch'
import { readAnnualPlanCache, writeAnnualPlanCache } from '@/lib/annualPlanQueryCache'
import { fetchSupabasePages } from '@/lib/supabasePagedFetch'

export const runtime = 'nodejs'

export type SalesActualSummary = {
  byStaff: Record<string, number>
  byCategory: Record<string, number>
  byStaffCategory: Record<string, Record<string, number>>
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

function add(map: Record<string, number>, key: string, amount: number) {
  if (!key) return
  map[key] = (map[key] || 0) + amount
}

export async function GET(request: Request) {
  try {
    const fiscalYear = Number(new URL(request.url).searchParams.get('fy'))
    if (!Number.isFinite(fiscalYear) || fiscalYear < 2000) {
      return NextResponse.json({ ok: false, error: 'fy が不正です' }, { status: 400 })
    }

    const cacheKey = `sales-actuals:${fiscalYear}`
    const cached = readAnnualPlanCache<SalesActualSummary>(cacheKey)
    if (cached) return NextResponse.json({ ok: true, ...cached })

    const sb = getSupabaseAdmin()
    const staffs = await fetchStaffsForExcelMatch(sb)

    const { data: latest, error: latestError } = await sb
      .from('annual_sales_actual_imports')
      .select('id, file_name, sheet_name, row_count, skipped_count, unmatched_staff_count, imported_at')
      .eq('fiscal_year', fiscalYear)
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestError) throw new Error(latestError.message)

    const rows = await fetchSupabasePages<{
      staff_id: string | null
      staff_name_raw: string | null
      plan_category: string | null
      amount_ex_tax: number | null
    }>({
      count: async () => {
        const { count, error } = await sb
          .from('annual_sales_actual_lines')
          .select('id', { count: 'exact', head: true })
          .eq('fiscal_year', fiscalYear)
        if (error) throw new Error(error.message)
        return count || 0
      },
      page: async (from, to) => {
        const { data, error } = await sb
          .from('annual_sales_actual_lines')
          .select('staff_id, staff_name_raw, plan_category, amount_ex_tax')
          .eq('fiscal_year', fiscalYear)
          .order('id', { ascending: true })
          .range(from, to)
        if (error) throw new Error(error.message)
        return data || []
      },
    })

    const byStaff: Record<string, number> = {}
    const byCategory: Record<string, number> = {}
    const byStaffCategory: Record<string, Record<string, number>> = {}
    let unmatchedAmount = 0
    let totalAmount = 0

    for (const row of rows) {
      const amount = Number(row.amount_ex_tax || 0)
      if (amount === 0) continue
      totalAmount += amount
      const category = String(row.plan_category || '')
      add(byCategory, category, amount)
      const staffId = row.staff_id
        ? String(row.staff_id)
        : resolveExcelStaffId(String(row.staff_name_raw || ''), staffs)
      if (staffId) {
        add(byStaff, staffId, amount)
        if (!byStaffCategory[staffId]) byStaffCategory[staffId] = {}
        add(byStaffCategory[staffId], category, amount)
      } else unmatchedAmount += amount
    }

    const summary: SalesActualSummary = {
      byStaff,
      byCategory,
      byStaffCategory,
      unmatchedAmount,
      totalAmount,
      import: latest
        ? {
            file_name: latest.file_name || null,
            sheet_name: latest.sheet_name || null,
            row_count: Number(latest.row_count || 0),
            skipped_count: Number(latest.skipped_count || 0),
            unmatched_staff_count: Number(latest.unmatched_staff_count || 0),
            imported_at: latest.imported_at || null,
          }
        : null,
    }

    writeAnnualPlanCache(cacheKey, summary)
    return NextResponse.json({ ok: true, ...summary })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    const missing =
      /could not find the table/i.test(message) ||
      /schema cache/i.test(message) ||
      /does not exist/i.test(message)
    return NextResponse.json(
      {
        ok: false,
        error: missing
          ? `売上実績テーブルがありません。Supabase で create_annual_sales_actual_tables.sql を実行してください。`
          : message,
      },
      { status: missing ? 404 : 500 },
    )
  }
}
