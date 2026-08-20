import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { escapeForIlikeFragment } from '@/lib/repairProductSearch'

export const runtime = 'nodejs'

const PAGE_SIZE = 1000
const MAX_PAGE_SIZE = 100

type ProductRow = { id: string; name: string; unit: string | null; retail_price: number | null }

function applySearch<T extends { or: (filter: string) => T }>(query: T, q: string): T {
    if (!q) return query
    const pat = `%${escapeForIlikeFragment(q)}%`
    return query.or(`name.ilike.${pat},id.ilike.${pat}`)
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url)
        const q = url.searchParams.get('q')?.trim() ?? ''
        const pageRaw = Number(url.searchParams.get('page') || 0)
        const pageSizeRaw = Number(url.searchParams.get('pageSize') || 0)
        const limitRaw = Number(url.searchParams.get('limit') || 0)
        const sb = getSupabaseAdmin()

        if (Number.isFinite(pageRaw) && pageRaw >= 1) {
            const pageSize =
                Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
                    ? Math.min(Math.floor(pageSizeRaw), MAX_PAGE_SIZE)
                    : 20
            const page = Math.floor(pageRaw)
            const from = (page - 1) * pageSize
            let query = sb
                .from('products')
                .select('id, name, unit, retail_price', { count: 'exact' })
                .order('name')
                .range(from, from + pageSize - 1)
            query = applySearch(query, q)
            const { data, error, count } = await query
            if (error) {
                return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
            }
            const total = count ?? 0
            return NextResponse.json({
                ok: true,
                products: data || [],
                total,
                page,
                pageSize,
                totalPages: Math.max(1, Math.ceil(total / pageSize)),
            })
        }

        const maxRows = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : Number.POSITIVE_INFINITY
        const rows: ProductRow[] = []
        let from = 0

        while (true) {
            const pageSize = Number.isFinite(maxRows)
                ? Math.min(PAGE_SIZE, maxRows - rows.length)
                : PAGE_SIZE
            if (pageSize <= 0) break

            let query = sb.from('products').select('id, name, unit, retail_price').order('name').range(from, from + pageSize - 1)
            query = applySearch(query, q)

            const { data, error } = await query
            if (error) {
                return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
            }

            const page = data || []
            rows.push(...page)
            if (page.length < pageSize) break
            if (rows.length >= maxRows) break
            from += pageSize
        }

        return NextResponse.json({ ok: true, products: rows, total: rows.length })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
