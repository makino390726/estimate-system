import { NextResponse } from 'next/server'
import { listStaffLineMappings, upsertStaffLineMapping } from '@/lib/lineStaffMappingDb'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

/** 管理画面: 登録一覧・保存・更新・削除（service role） */
export async function GET() {
    try {
        const sb = getSupabaseAdmin()
        const { data, error } = await listStaffLineMappings(sb)
        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
        }
        return NextResponse.json({ ok: true, mappings: data || [] })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        const result = await upsertStaffLineMapping(getSupabaseAdmin(), {
            staff_name: body.staff_name,
            line_user_id: body.line_user_id,
            line_display_name: body.line_display_name,
        })
        if (!result.ok) {
            return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
        }
        return NextResponse.json({ ok: true, staff_name: result.staff_name, line_user_id: result.line_user_id })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
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
            .from('line_staff_mappings')
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
        const { error } = await sb.from('line_staff_mappings').delete().eq('id', id)
        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
        }
        return NextResponse.json({ ok: true })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
