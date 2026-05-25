import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

export async function GET() {
    try {
        const sb = getSupabaseAdmin()
        const { data, error } = await sb.from('staffs').select('id, name').order('name')
        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
        }
        const staff = (data || [])
            .map((s) => ({
                id: String(s.id ?? ''),
                name: String(s.name || '').trim(),
            }))
            .filter((s) => s.id && s.name)
        const names = staff.map((s) => s.name)
        return NextResponse.json({ ok: true, names, staff })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
