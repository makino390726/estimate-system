import { NextResponse } from 'next/server'
import { linkServiceReportsToCustomerRegister } from '@/lib/linkServiceReportsToCustomerRegister'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

export async function POST() {
    try {
        const sb = getSupabaseAdmin()
        const result = await linkServiceReportsToCustomerRegister(sb)
        return NextResponse.json({ ok: true, ...result })
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        const missingColumn = /customer_register_id/i.test(msg)
        return NextResponse.json(
            {
                ok: false,
                error: msg,
                hint: missingColumn
                    ? 'Supabase で add_service_repair_reports_customer_register_id.sql を実行してください。'
                    : undefined,
            },
            { status: 500 },
        )
    }
}
