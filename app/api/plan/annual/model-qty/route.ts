import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { fiscalYearFromDate } from '@/lib/annualPlanFiscal'

export const runtime = 'nodejs'

/** 年度×機種の営業計画台数。factory-materials の製造計画が参照する */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const fiscalYear = Number(url.searchParams.get('fiscalYear') || fiscalYearFromDate())
    if (!Number.isFinite(fiscalYear)) {
      return NextResponse.json({ ok: false, error: 'fiscalYear が不正です' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const { data: plans, error: planError } = await sb
      .from('annual_staff_plans')
      .select('id')
      .eq('fiscal_year', fiscalYear)
    if (planError) throw new Error(planError.message)

    const planIds = (plans || []).map((p) => p.id)
    if (planIds.length === 0) {
      return NextResponse.json({ ok: true, fiscalYear, rows: [] })
    }

    const { data: lines, error: lineError } = await sb
      .from('annual_staff_plan_lines')
      .select('machine_code, machine_name, machine_source, qty, confidence, amount')
      .in('plan_id', planIds)
    if (lineError) throw new Error(lineError.message)

    const byModel = new Map<
      string,
      { machine_code: string; machine_name: string; qty: number; highQty: number; amount: number }
    >()
    for (const line of lines || []) {
      if (line.machine_source === 'product') continue
      const code = String(line.machine_code || '').trim()
      if (!code) continue
      const prev = byModel.get(code) || {
        machine_code: code,
        machine_name: String(line.machine_name || code),
        qty: 0,
        highQty: 0,
        amount: 0,
      }
      const qty = Number(line.qty) || 0
      prev.qty += qty
      if (line.confidence === 'high') prev.highQty += qty
      prev.amount += Number(line.amount) || 0
      byModel.set(code, prev)
    }

    return NextResponse.json({
      ok: true,
      fiscalYear,
      rows: Array.from(byModel.values()).sort((a, b) => a.machine_code.localeCompare(b.machine_code, 'ja')),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
