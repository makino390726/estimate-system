import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type Body = {
    staff_name?: string
    line_user_id?: string
    line_display_name?: string | null
}

function getSupabaseAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    return createClient(url, key)
}

/** 担当者本人の LIFF から LINE User ID を登録 */
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Body
        const staff_name = String(body.staff_name || '').trim()
        const line_user_id = String(body.line_user_id || '').trim()
        const line_display_name = body.line_display_name
            ? String(body.line_display_name).trim() || null
            : null

        if (!staff_name || !line_user_id) {
            return NextResponse.json(
                { ok: false, error: 'staff_name and line_user_id are required' },
                { status: 400 },
            )
        }
        if (!line_user_id.startsWith('U')) {
            return NextResponse.json(
                { ok: false, error: 'Invalid LINE User ID' },
                { status: 400 },
            )
        }

        const sb = getSupabaseAdmin()
        const { data: staffRow } = await sb.from('staffs').select('name').eq('name', staff_name).maybeSingle()
        if (!staffRow) {
            return NextResponse.json(
                { ok: false, error: `担当者「${staff_name}」が staffs に見つかりません` },
                { status: 400 },
            )
        }

        const { error } = await sb.from('line_staff_mappings').upsert(
            {
                staff_name,
                line_user_id,
                line_display_name,
                notify_enabled: true,
            },
            { onConflict: 'staff_name' },
        )

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
        }

        return NextResponse.json({ ok: true, staff_name, line_user_id })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
