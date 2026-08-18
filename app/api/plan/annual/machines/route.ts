import { NextResponse } from 'next/server'
import { fetchPlanMachines } from '@/lib/annualPlanMachines'
import { isKnownPlanCategory } from '@/lib/annualPlanCategories'

export const runtime = 'nodejs'
export const revalidate = 300

export async function GET(request: Request) {
  try {
    const category = new URL(request.url).searchParams.get('category')?.trim() || ''
    if (!category) {
      return NextResponse.json({ ok: false, error: 'category は必須です' }, { status: 400 })
    }
    if (!isKnownPlanCategory(category)) {
      return NextResponse.json({ ok: false, error: '不明なカテゴリです' }, { status: 400 })
    }
    const result = await fetchPlanMachines(category)
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } },
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
