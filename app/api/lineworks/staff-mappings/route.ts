import { NextResponse } from 'next/server'
import { listLineWorksStaffMappings, upsertLineWorksStaffMapping } from '@/lib/lineworksStaffMappingDb'
import { getSupabaseAdmin, hasSupabaseServiceRole } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

export async function GET() {
    try {
        const sb = getSupabaseAdmin()
        const { data, error } = await listLineWorksStaffMappings(sb)
        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
        }
        return NextResponse.json({ ok: true, mappings: data || [] })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}

function serviceRoleHint() {
    return (
        'Vercel に SUPABASE_SERVICE_ROLE_KEY を設定するか、Supabase で enable_lineworks_staff_mappings_rls.sql を実行してください'
    )
}

export async function POST(request: Request) {
    try {
        if (!hasSupabaseServiceRole()) {
            console.warn('lineworks staff-mappings POST: SUPABASE_SERVICE_ROLE_KEY not set, using anon (RLS may block)')
        }
        const body = await request.json().catch(() => ({}))
        const result = await upsertLineWorksStaffMapping(getSupabaseAdmin(), {
            staff_id: body.staff_id,
            staff_name: body.staff_name,
            lineworks_user_id: body.lineworks_user_id,
            display_name: body.display_name,
        })
        if (!result.ok) {
            const error =
                result.error.includes('row-level security') && !hasSupabaseServiceRole()
                    ? `${result.error} — ${serviceRoleHint()}`
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
        const error = message.includes('row-level security') && !hasSupabaseServiceRole()
            ? `${message} — ${serviceRoleHint()}`
            : message
        return NextResponse.json({ ok: false, error }, { status: 500 })
    }
}

export async function PATCH(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as { id?: string; notify_enabled?: boolean }
        const id = String(body.id || '').trim()
        if (!id || typeof body.notify_enabled !== 'boolean') {
            return NextResponse.json({ ok: false, error: 'id and notify_enabled are required' }, { status: 400 })
        }
        const sb = getSupabaseAdmin()
        const { error } = await sb
            .from('lineworks_staff_mappings')
            .update({ notify_enabled: body.notify_enabled })
            .eq('id', id)
        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
        }
        return NextResponse.json({ ok: true })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}

export async function DELETE(request: Request) {
    try {
        const id = new URL(request.url).searchParams.get('id')?.trim()
        if (!id) {
            return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
        }
        const sb = getSupabaseAdmin()
        const { error } = await sb.from('lineworks_staff_mappings').delete().eq('id', id)
        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
        }
        return NextResponse.json({ ok: true })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
