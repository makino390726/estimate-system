import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

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

    const sb = getSupabaseAdmin()
    const { data: latest, error: latestError } = await sb
      .from('annual_sales_actual_imports')
      .select('id, file_name, sheet_name, row_count, skipped_count, unmatched_staff_count, imported_at')
      .eq('fiscal_year', fiscalYear)
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestError) throw new Error(latestError.message)

    const byStaff: Record<string, number> = {}
    const byCategory: Record<string, number> = {}
    let unmatchedAmount = 0
    let totalAmount = 0
    const pageSize = 1000
    let offset = 0

    while (true) {
      const { data, error } = await sb
        .from('annual_sales_actual_lines')
        .select('staff_id, plan_category, amount_ex_tax')
        .eq('fiscal_year', fiscalYear)
        .gt('amount_ex_tax', 0)
        .range(offset, offset + pageSize - 1)
      if (error) throw new Error(error.message)
      const rows = data || []
      for (const row of rows) {
        const amount = Number(row.amount_ex_tax || 0)
        if (!(amount > 0)) continue
        totalAmount += amount
        add(byCategory, String(row.plan_category || ''), amount)
        if (row.staff_id) add(byStaff, String(row.staff_id), amount)
        else unmatchedAmount += amount
      }
      if (rows.length < pageSize) break
      offset += pageSize
    }

    const summary: SalesActualSummary = {
      byStaff,
      byCategory,
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
