import { NextResponse } from 'next/server'
import { PROGRESS_CATEGORIES } from '@/lib/annualPlanCategories'
import { fiscalMonthIndex, fiscalMonthSlots } from '@/lib/annualPlanFiscal'
import type { ActualTrace } from '@/lib/annualPlanItemProgress'
import { isMissingPlanTableError, loadItemMonthProgress } from '@/lib/annualPlanProgressLoad'
import { clearAnnualPlanCaches, readAnnualPlanCache, writeAnnualPlanCache } from '@/lib/annualPlanQueryCache'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const maxDuration = 60

const TRACE_LIMIT = 500
const SETUP_MESSAGE =
  '振り替えテーブルがありません。Supabase の SQL Editor で create_annual_sales_actual_assignments.sql を実行してください。'

function filterTraces(traces: ActualTrace[], view: string): ActualTrace[] {
  if (view === 'all') return traces
  if (view === 'coded') return traces.filter((row) => row.coded)
  if (view === 'changed') return traces.filter((row) => row.overridden)
  return traces.filter((row) => row.targetLabel === view)
}

function filterByMonth(traces: ActualTrace[], monthKey: string): ActualTrace[] {
  if (monthKey === 'all') return traces
  return traces.filter((row) => String(row.billedOn || '').slice(0, 7) === monthKey)
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const fiscalYear = Number(url.searchParams.get('fy'))
    const staffId = String(url.searchParams.get('staff') || '').trim()
    const view = String(url.searchParams.get('view') || '工事その他')
    const month = String(url.searchParams.get('month') || 'all')
    if (!Number.isFinite(fiscalYear) || fiscalYear < 2000) {
      return NextResponse.json({ ok: false, error: 'fy が不正です' }, { status: 400 })
    }
    if (!staffId || staffId === 'all') {
      return NextResponse.json({ ok: false, error: 'staff は必須です' }, { status: 400 })
    }
    if (month !== 'all' && fiscalMonthIndex(`${month}-01`, fiscalYear) == null) {
      return NextResponse.json({ ok: false, error: 'month が不正です' }, { status: 400 })
    }

    const cacheKey = `actual-traces-v1:${fiscalYear}:${staffId}`
    let loaded = readAnnualPlanCache<Awaited<ReturnType<typeof loadItemMonthProgress>>>(cacheKey)
    if (!loaded) {
      loaded = await loadItemMonthProgress(fiscalYear, staffId, { withTraces: true })
      if (loaded.assignmentsReady) writeAnnualPlanCache(cacheKey, loaded)
    }
    const byView = filterTraces(loaded.traces, view)
    const monthCounts: Record<string, number> = {}
    for (const slot of fiscalMonthSlots(fiscalYear)) monthCounts[slot.key] = 0
    for (const row of byView) {
      const key = String(row.billedOn || '').slice(0, 7)
      if (key in monthCounts) monthCounts[key] += 1
    }
    const matched = filterByMonth(byView, month)
    return NextResponse.json({
      ok: true,
      view,
      month,
      monthCounts,
      total: matched.length,
      truncated: matched.length > TRACE_LIMIT,
      rows: matched.slice(0, TRACE_LIMIT),
      targets: loaded.targets,
      assignmentsReady: loaded.assignmentsReady,
      setupMessage: loaded.assignmentsReady ? null : SETUP_MESSAGE,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    const missing = isMissingPlanTableError(message)
    return NextResponse.json(
      {
        ok: false,
        error: missing ? '売上実績または計画テーブルがありません。Supabase で年度計画用SQLを実行してください。' : message,
      },
      { status: missing ? 404 : 500 },
    )
  }
}

function validTargetKey(targetKey: string): boolean {
  if (targetKey.startsWith('bucket:')) {
    const cat = targetKey.slice('bucket:'.length)
    return (PROGRESS_CATEGORIES as readonly string[]).includes(cat) || cat === 'その他'
  }
  return targetKey.includes('::') && targetKey.length <= 400
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      fy?: number
      staffId?: string
      fingerprint?: string
      targetKey?: string
    }
    const fiscalYear = Number(body.fy)
    const staffId = String(body.staffId || '').trim()
    const fingerprint = String(body.fingerprint || '').trim()
    const targetKey = String(body.targetKey || '').trim()
    if (!Number.isFinite(fiscalYear) || fiscalYear < 2000) {
      return NextResponse.json({ ok: false, error: 'fy が不正です' }, { status: 400 })
    }
    if (!staffId || staffId.length > 80) {
      return NextResponse.json({ ok: false, error: 'staff は必須です' }, { status: 400 })
    }
    if (!fingerprint || fingerprint.length > 500) {
      return NextResponse.json({ ok: false, error: '明細の指定が不正です' }, { status: 400 })
    }
    if (targetKey && !validTargetKey(targetKey)) {
      return NextResponse.json({ ok: false, error: '振り替え先が不正です' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    if (!targetKey) {
      const { error } = await sb
        .from('annual_sales_actual_assignments')
        .delete()
        .eq('fiscal_year', fiscalYear)
        .eq('staff_id', staffId)
        .eq('line_fingerprint', fingerprint)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await sb.from('annual_sales_actual_assignments').upsert(
        {
          fiscal_year: fiscalYear,
          staff_id: staffId,
          line_fingerprint: fingerprint,
          target_key: targetKey,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'fiscal_year,staff_id,line_fingerprint' },
      )
      if (error) throw new Error(error.message)
    }
    clearAnnualPlanCaches()
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    const missing = isMissingPlanTableError(message)
    return NextResponse.json(
      { ok: false, error: missing ? SETUP_MESSAGE : message },
      { status: missing ? 404 : 500 },
    )
  }
}
