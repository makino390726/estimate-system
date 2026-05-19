import { NextResponse } from 'next/server'
import { BRANCHES } from '@/lib/branches'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

/** LIFF 修理フォーム用：営業所・担当者プルダウン（読み取り専用） */
export async function GET() {
    try {
        const sb = getSupabaseAdmin()

        const { data: staffRows, error } = await sb
            .from('staffs')
            .select('name, branch_id, department')
            .order('name')

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        const staffs = (staffRows || [])
            .map((s) => ({
                name: String(s.name || '').trim(),
                branch_id: s.branch_id ? String(s.branch_id).trim() : null,
                department: s.department ? String(s.department).trim() : null,
            }))
            .filter((s) => s.name)

        return NextResponse.json({
            branches: BRANCHES.map((b) => ({ id: b.id, name: b.name })),
            staffs,
        })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
