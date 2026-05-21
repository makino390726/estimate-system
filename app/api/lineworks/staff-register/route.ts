import { NextResponse } from 'next/server'
import { upsertLineWorksStaffMapping } from '@/lib/lineworksStaffMappingDb'
import { getSupabaseAdmin, hasSupabaseServiceRole } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

type Body = {
    staff_name?: string
    lineworks_user_id?: string
    display_name?: string | null
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Body
        const result = await upsertLineWorksStaffMapping(getSupabaseAdmin(), {
            staff_name: body.staff_name,
            lineworks_user_id: body.lineworks_user_id,
            display_name: body.display_name,
        })
        if (!result.ok) {
            const hint = 'Vercel に SUPABASE_SERVICE_ROLE_KEY を設定するか、Supabase で enable_lineworks_staff_mappings_rls.sql を実行してください'
            const error =
                result.error.includes('row-level security') && !hasSupabaseServiceRole()
                    ? `${result.error} — ${hint}`
                    : result.error
            return NextResponse.json({ ok: false, error }, { status: result.status })
        }
        return NextResponse.json({
            ok: true,
            staff_name: result.staff_name,
            lineworks_user_id: result.lineworks_user_id,
        })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
