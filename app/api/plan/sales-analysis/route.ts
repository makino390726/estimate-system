import { NextResponse } from 'next/server'
import { buildSalesAnalysis, type SalesLine } from '@/lib/salesAnalysisBuild'
import { findSalesAnalysisItem } from '@/lib/salesAnalysisMenu'
import { readAnnualPlanCache, writeAnnualPlanCache } from '@/lib/annualPlanQueryCache'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchSupabasePages } from '@/lib/supabasePagedFetch'

export const runtime = 'nodejs'

type RawLine = {
  slip_no: string | null
  billed_on: string | null
  product_name: string | null
  customer_name: string | null
  kamoku: string | null
  department: string | null
  staff_name_raw: string | null
  unit_price: number | null
  amount_ex_tax: number | null
}

async function loadLines(fiscalYear: number): Promise<SalesLine[]> {
  const sb = getSupabaseAdmin()
  const rows = await fetchSupabasePages<RawLine>({
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
        .select('slip_no, billed_on, product_name, customer_name, kamoku, department, staff_name_raw, unit_price, amount_ex_tax')
        .eq('fiscal_year', fiscalYear)
        .order('id', { ascending: true })
        .range(from, to)
      if (error) throw new Error(error.message)
      return data || []
    },
  })
  return rows.map((row) => ({
    slip_no: String(row.slip_no || ''),
    billed_on: String(row.billed_on || ''),
    product_name: String(row.product_name || ''),
    customer_name: String(row.customer_name || ''),
    kamoku: String(row.kamoku || ''),
    department: String(row.department || ''),
    staff_name: String(row.staff_name_raw || ''),
    unit_price: Number(row.unit_price || 0),
    amount: Number(row.amount_ex_tax || 0),
  }))
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const fiscalYear = Number(url.searchParams.get('fy'))
    const view = String(url.searchParams.get('view') || '')
    const item = findSalesAnalysisItem(view)
    if (!item) return NextResponse.json({ ok: false, error: '分析メニューが不正です' }, { status: 400 })
    if (!Number.isFinite(fiscalYear) || fiscalYear < 2000) {
      return NextResponse.json({ ok: false, error: 'fy が不正です' }, { status: 400 })
    }

    const cacheKey = `sales-analysis-v3:${fiscalYear}:${view}`
    const cached = readAnnualPlanCache<ReturnType<typeof buildSalesAnalysis>>(cacheKey)
    if (cached) return NextResponse.json({ ok: true, item, ...cached })

    const current = await loadLines(fiscalYear)
    const prior = item.needsPriorYear ? await loadLines(fiscalYear - 1) : []
    const payload = buildSalesAnalysis(view, current, prior, fiscalYear)
    writeAnnualPlanCache(cacheKey, payload)
    return NextResponse.json({ ok: true, item, ...payload })
  } catch (error) {
    const message = error instanceof Error ? error.message : '集計に失敗しました'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
