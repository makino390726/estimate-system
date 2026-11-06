import { NextResponse } from 'next/server'
import { isMissingPlanTableError, loadItemMonthProgress } from '@/lib/annualPlanProgressLoad'
import { readAnnualPlanCache, writeAnnualPlanCache } from '@/lib/annualPlanQueryCache'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const fiscalYear = Number(url.searchParams.get('fy'))
    const staffId = String(url.searchParams.get('staff') || '').trim()
    const allStaff = staffId === 'all'
    if (!Number.isFinite(fiscalYear) || fiscalYear < 2000) {
      return NextResponse.json({ ok: false, error: 'fy が不正です' }, { status: 400 })
    }
    if (!allStaff && !staffId) {
      return NextResponse.json({ ok: false, error: 'staff は必須です' }, { status: 400 })
    }

    const cacheKey = `item-progress-v6:${fiscalYear}:${allStaff ? 'all' : staffId}`
    const cached = readAnnualPlanCache<Record<string, unknown>>(cacheKey)
    if (cached) return NextResponse.json({ ok: true, ...cached })

    const loaded = await loadItemMonthProgress(fiscalYear, allStaff ? 'all' : staffId)
    const result = {
      months: loaded.months,
      rows: loaded.rows,
      unmatched: loaded.unmatched,
      unmatchedByCategory: loaded.unmatchedByCategory,
      targets: loaded.targets,
    }
    writeAnnualPlanCache(cacheKey, result)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    const missing = isMissingPlanTableError(message)
    return NextResponse.json(
      {
        ok: false,
        error: missing
          ? '売上実績または計画テーブルがありません。Supabase で年度計画用SQLを実行してください。'
          : message,
      },
      { status: missing ? 404 : 500 },
    )
  }
}
