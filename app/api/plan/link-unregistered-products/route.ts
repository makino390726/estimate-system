import { NextResponse } from 'next/server'
import { linkUnregisteredCaseDetails } from '@/lib/linkUnregisteredCaseDetails'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        const dryRun = Boolean(body.dryRun)

        const result = await linkUnregisteredCaseDetails(getSupabaseAdmin(), { dryRun })

        return NextResponse.json({
            ok: true,
            dryRun,
            ...result,
        })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
