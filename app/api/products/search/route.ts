import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

const PAGE_SIZE = 1000

export async function GET(request: Request) {
    try {
        const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
        const sb = getSupabaseAdmin()
        const rows: Array<{ id: string; name: string; unit: string | null }> = []
        let from = 0

        while (true) {
            let query = sb.from('products').select('id, name, unit').order('name').range(from, from + PAGE_SIZE - 1)
            if (q) query = query.ilike('name', `%${q}%`)

            const { data, error } = await query
            if (error) {
                return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
            }

            const page = data || []
            rows.push(...page)
            if (page.length < PAGE_SIZE) break
            from += PAGE_SIZE
        }

        return NextResponse.json({ ok: true, products: rows })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
