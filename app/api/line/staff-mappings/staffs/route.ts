import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

/** 管理画面: 担当者名プルダウン用 */
export async function GET() {
    try {
        const sb = getSupabaseAdmin()
        const { data, error } = await sb.from('staffs').select('name').order('name')
        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
        }
        const names = (data || []).map((s) => String(s.name || '').trim()).filter(Boolean)
        return NextResponse.json({ ok: true, names })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
