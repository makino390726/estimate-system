import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveStaffName } from '@/lib/staffNameMatch'

export const runtime = 'nodejs'

type Body = {
    staff_name?: string
    line_user_id?: string
    line_display_name?: string | null
}

const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xdiqyslnokscgcuoakle.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getSupabaseAdmin() {
    if (supabaseServiceKey) {
        return createClient(supabaseUrl, supabaseServiceKey)
    }
    const anonKey =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkaXF5c2xub2tzY2djdW9ha2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzOTQyMDMsImV4cCI6MjA3Nzk3MDIwM30.aGgaWQvsNhlnh6GO7wAgbTcL9JFpvT2xKnUQMZcnZuk'
    return createClient(supabaseUrl, anonKey)
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
        const { data: staffRows, error: staffListErr } = await sb.from('staffs').select('name').order('name')
        if (staffListErr) {
            return NextResponse.json({ ok: false, error: staffListErr.message }, { status: 500 })
        }
        const staffNames = (staffRows || []).map((r) => String(r.name || '').trim()).filter(Boolean)
        const canonicalName = resolveStaffName(staff_name, staffNames)
        if (!canonicalName) {
            return NextResponse.json(
                { ok: false, error: `担当者「${staff_name}」が staffs に見つかりません` },
                { status: 400 },
            )
        }

        const { error } = await sb.from('line_staff_mappings').upsert(
            {
                staff_name: canonicalName,
                line_user_id,
                line_display_name,
                notify_enabled: true,
            },
            { onConflict: 'staff_name' },
        )

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
        }

        return NextResponse.json({ ok: true, staff_name: canonicalName, line_user_id })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
