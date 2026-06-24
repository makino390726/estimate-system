import { NextResponse } from 'next/server'
import { fetchManufacturingPlanAggregatedWithFallback } from '@/lib/manufacturingPlanAggregate'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

export async function GET(request: Request) {
    try {
        const url = new URL(request.url)
        const from = url.searchParams.get('from')
        const to = url.searchParams.get('to')

        const groupBy = url.searchParams.get('groupBy') === 'name_spec' ? 'name_spec' : 'code'

        const result = await fetchManufacturingPlanAggregatedWithFallback(getSupabaseAdmin(), {
            from,
            to,
            groupBy,
        })

        return NextResponse.json({
            ok: true,
            rows: result.rows,
            meta: {
                caseCount: result.caseCount,
                detailCount: result.detailCount,
                unlinkedDetailCount: result.unlinkedDetailCount,
                groupBy: result.groupBy,
                source: result.source,
            },
        })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
