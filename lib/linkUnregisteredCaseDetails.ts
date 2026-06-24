import type { SupabaseClient } from '@supabase/supabase-js'
import {
    normalizeProductNameKey,
    type ProductNameRow,
} from '@/lib/productNameMatch'

type DetailRow = {
    id: number
    product_id: string | null
    unregistered_product: string | null
}

type ProductRow = ProductNameRow

type UnregisteredGroup = {
    label: string
    ids: number[]
}

function buildProductIndex(products: readonly ProductRow[]) {
    const exact = new Map<string, ProductRow>()
    const byLength = [...products].sort(
        (a, b) => normalizeProductNameKey(b.name).length - normalizeProductNameKey(a.name).length,
    )
    for (const p of products) {
        const key = normalizeProductNameKey(p.name)
        if (key && !exact.has(key)) exact.set(key, p)
    }
    return { exact, byLength }
}

function resolveProductFast(unregistered: string, index: ReturnType<typeof buildProductIndex>): ProductRow | null {
    const key = normalizeProductNameKey(unregistered)
    if (!key) return null
    const hit = index.exact.get(key)
    if (hit) return hit
    for (const p of index.byLength) {
        const pk = normalizeProductNameKey(p.name)
        if (pk.length >= 2 && key.includes(pk)) return p
    }
    if (key.length >= 4) {
        for (const p of index.byLength) {
            const pk = normalizeProductNameKey(p.name)
            if (pk.includes(key)) return p
        }
    }
    return null
}

function groupUnlinkedDetails(details: DetailRow[]): UnregisteredGroup[] {
    const map = new Map<string, UnregisteredGroup>()
    for (const d of details) {
        const label = String(d.unregistered_product || '').trim()
        if (!label) continue
        const key = normalizeProductNameKey(label) || label
        const prev = map.get(key)
        if (prev) {
            prev.ids.push(d.id)
        } else {
            map.set(key, { label, ids: [d.id] })
        }
    }
    return Array.from(map.values())
}

export type LinkUnregisteredResult = {
    scanned: number
    matched: number
    updated: number
    skipped: number
    failed: number
    samples: Array<{
        detail_id: number
        unregistered_product: string
        product_id: string
        product_name: string
    }>
}

const DETAIL_PAGE = 1000
const UPDATE_BATCH = 100

async function fetchAllProducts(sb: SupabaseClient): Promise<ProductRow[]> {
    const rows: ProductRow[] = []
    let from = 0
    while (true) {
        const { data, error } = await sb
            .from('products')
            .select('id, name')
            .range(from, from + DETAIL_PAGE - 1)
        if (error) throw new Error(error.message)
        const page = (data || []) as ProductRow[]
        for (const p of page) {
            const id = String(p.id || '').trim()
            const name = String(p.name || '').trim()
            if (id && name) rows.push({ id, name })
        }
        if (page.length < DETAIL_PAGE) break
        from += DETAIL_PAGE
    }
    return rows
}

async function fetchUnlinkedDetails(sb: SupabaseClient): Promise<DetailRow[]> {
    const rows: DetailRow[] = []
    let from = 0
    while (true) {
        const { data, error } = await sb
            .from('case_details')
            .select('id, product_id, unregistered_product')
            .is('product_id', null)
            .not('unregistered_product', 'is', null)
            .range(from, from + DETAIL_PAGE - 1)
        if (error) throw new Error(error.message)
        const page = (data || []) as DetailRow[]
        rows.push(...page)
        if (page.length < DETAIL_PAGE) break
        from += DETAIL_PAGE
    }
    return rows.filter((d) => String(d.unregistered_product || '').trim())
}

async function updateDetailBatch(
    sb: SupabaseClient,
    ids: number[],
    productId: string,
): Promise<{ updated: number; failed: number }> {
    let updated = 0
    let failed = 0
    for (let i = 0; i < ids.length; i += UPDATE_BATCH) {
        const chunk = ids.slice(i, i + UPDATE_BATCH)
        const { error, count } = await sb
            .from('case_details')
            .update({ product_id: productId }, { count: 'exact' })
            .in('id', chunk)
            .is('product_id', null)
        if (error) {
            failed += chunk.length
        } else {
            updated += count ?? chunk.length
        }
    }
    return { updated, failed }
}

export async function linkUnregisteredCaseDetails(
    sb: SupabaseClient,
    options: { dryRun?: boolean } = {},
): Promise<LinkUnregisteredResult> {
    const dryRun = Boolean(options.dryRun)

    const [products, details] = await Promise.all([
        fetchAllProducts(sb),
        fetchUnlinkedDetails(sb),
    ])
    const index = buildProductIndex(products)
    const groups = groupUnlinkedDetails(details)

    const result: LinkUnregisteredResult = {
        scanned: details.length,
        matched: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        samples: [],
    }

    for (const group of groups) {
        const match = resolveProductFast(group.label, index)
        if (!match) {
            result.skipped += group.ids.length
            continue
        }

        result.matched += group.ids.length
        if (result.samples.length < 20) {
            result.samples.push({
                detail_id: group.ids[0],
                unregistered_product: group.label,
                product_id: match.id,
                product_name: match.name,
            })
        }

        if (dryRun) continue

        const batch = await updateDetailBatch(sb, group.ids, match.id)
        result.updated += batch.updated
        result.failed += batch.failed
    }

    return result
}

/** 集計キー重複防止用（テスト・デバッグ） */
export function previewUnregisteredKey(name: string): string {
    return `unreg:${normalizeProductNameKey(name).slice(0, 120)}`
}
