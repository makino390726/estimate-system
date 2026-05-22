import type { SupabaseClient } from '@supabase/supabase-js'

/** 商品マスタ検索の最大件数 */
export const REPAIR_PRODUCT_SEARCH_LIMIT = 500

export type RepairProductSuggestion = {
    id: string
    name: string
    cost_price: number | null
    retail_price: number | null
}

export function escapeForIlikeFragment(raw: string): string {
    return raw
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
        .replace(/,/g, ' ')
}

/** 商品名・仕様・コードであいまい検索（全件数上限まで） */
export async function searchRepairProducts(
    sb: SupabaseClient,
    query: string,
): Promise<RepairProductSuggestion[]> {
    const raw = query.trim()
    if (raw.length < 1) return []

    const pat = `%${escapeForIlikeFragment(raw)}%`
    const sel = 'id, name, cost_price, retail_price'

    const [nameQ, specQ, idQ] = await Promise.all([
        sb.from('products').select(sel).ilike('name', pat).order('name').limit(REPAIR_PRODUCT_SEARCH_LIMIT),
        sb.from('products').select(sel).ilike('spec', pat).order('name').limit(REPAIR_PRODUCT_SEARCH_LIMIT),
        sb.from('products').select(sel).ilike('id', pat).order('name').limit(100),
    ])

    if (nameQ.error) throw nameQ.error

    const merged = new Map<string, RepairProductSuggestion>()
    for (const row of [...(nameQ.data || []), ...(specQ.error ? [] : specQ.data || []), ...(idQ.error ? [] : idQ.data || [])]) {
        const r = row as RepairProductSuggestion
        merged.set(String(r.id), r)
    }
    return Array.from(merged.values()).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'))
}

export function repairPartUnitPriceFromProduct(p: RepairProductSuggestion): number | null {
    if (p.retail_price != null) return p.retail_price
    if (p.cost_price != null) return p.cost_price
    return null
}

export function parseRepairPartQuantity(text: string): number {
    const t = text.trim()
    if (!t) return 1
    const n = Number(t)
    return Number.isFinite(n) && n > 0 ? n : 1
}
