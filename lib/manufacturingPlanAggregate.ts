import type { SupabaseClient } from '@supabase/supabase-js'
import {
    isSimilarNameOrSpec,
    normalizeProductNameKey,
    pickLongerDisplayName,
} from '@/lib/productNameMatch'
import { sortManufacturingPlanRows } from '@/lib/manufacturingPlanSort'

export type ManufacturingPlanGroupBy = 'code' | 'name_spec'

export type ManufacturingPlanRow = {
    id: string
    name: string | null
    spec: string | null
    product_codes: string[]
    total_quantity: number
    amount: number
    cost_amount: number
    avg_unit_price: number | null
    is_unregistered: boolean
    detail_count: number
}

type CaseRow = {
    case_id: string
    created_date: string | null
}

type DetailRow = {
    id: number
    case_id: string
    product_id: string | null
    unregistered_product: string | null
    spec: string | null
    quantity: number | null
    amount: number | null
    cost_amount: number | null
    exclude_from_total: boolean | null
}

type ProductRow = {
    id: string
    name: string | null
}

const CASE_BATCH = 80
const DETAIL_PAGE = 1000

const DETAIL_SELECT =
    'id, case_id, product_id, unregistered_product, spec, quantity, amount, cost_amount, exclude_from_total'

function unregisteredAggregateKey(raw: string): string {
    const key = normalizeProductNameKey(raw)
    if (!key) return 'unreg:empty'
    return `unreg:${key.slice(0, 120)}`
}

function parseDateParam(v: string | null | undefined): string | null {
    const s = String(v || '').trim()
    return s || null
}

function inDateRange(date: string | null, from: string | null, to: string | null): boolean {
    if (!date) return true
    if (from && date < from) return false
    if (to && date > to) return false
    return true
}

function resolveDetailLabel(
    d: DetailRow,
    productNames: Map<string, string>,
): { name: string; spec: string; productId: string; isUnregistered: boolean } | null {
    const productId = String(d.product_id || '').trim()
    const unreg = String(d.unregistered_product || '').trim()
    const spec = String(d.spec || '').trim()

    if (productId) {
        return {
            name: productNames.get(productId) || unreg || productId,
            spec,
            productId,
            isUnregistered: false,
        }
    }
    if (unreg) {
        return { name: unreg, spec, productId: '', isUnregistered: true }
    }
    return null
}

function finalizeRows(
    accList: Array<{
        id: string
        name: string | null
        spec: string | null
        product_codes: Set<string>
        total_quantity: number
        amount: number
        cost_amount: number
        is_unregistered: boolean
        detail_count: number
    }>,
): ManufacturingPlanRow[] {
    return sortManufacturingPlanRows(
        accList.map((row) => ({
            id: row.id,
            name: row.name,
            spec: row.spec,
            product_codes: Array.from(row.product_codes).sort((a, b) => a.localeCompare(b, 'ja')),
            total_quantity: row.total_quantity,
            amount: row.amount,
            cost_amount: row.cost_amount,
            is_unregistered: row.is_unregistered,
            detail_count: row.detail_count,
            avg_unit_price: row.total_quantity > 0 ? row.amount / row.total_quantity : null,
        })),
    )
}

async function fetchCasesInRange(
    sb: SupabaseClient,
    from: string | null,
    to: string | null,
): Promise<CaseRow[]> {
    let query = sb.from('cases').select('case_id, created_date')
    if (from) query = query.gte('created_date', from)
    if (to) query = query.lte('created_date', to)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data || []) as CaseRow[]
}

async function fetchDetailsInRange(
    sb: SupabaseClient,
    from: string | null,
    to: string | null,
): Promise<DetailRow[]> {
    const rows: DetailRow[] = []
    let pageFrom = 0

    while (true) {
        let query = sb
            .from('case_details')
            .select(`${DETAIL_SELECT}, cases!inner(created_date)`)

        if (from) query = query.gte('cases.created_date', from)
        if (to) query = query.lte('cases.created_date', to)

        const { data, error } = await query.range(pageFrom, pageFrom + DETAIL_PAGE - 1)
        if (error) {
            const cases = await fetchCasesInRange(sb, from, to)
            const caseIds = cases.map((c) => c.case_id).filter(Boolean)
            if (caseIds.length === 0) return []
            return fetchDetailsForCases(sb, caseIds)
        }

        const page = (data || []) as DetailRow[]
        rows.push(...page)
        if (page.length < DETAIL_PAGE) break
        pageFrom += DETAIL_PAGE
    }

    return rows
}

async function fetchDetailsForCases(sb: SupabaseClient, caseIds: string[]): Promise<DetailRow[]> {
    const rows: DetailRow[] = []
    for (let i = 0; i < caseIds.length; i += CASE_BATCH) {
        const chunk = caseIds.slice(i, i + CASE_BATCH)
        let from = 0
        while (true) {
            const { data, error } = await sb
                .from('case_details')
                .select(DETAIL_SELECT)
                .in('case_id', chunk)
                .range(from, from + DETAIL_PAGE - 1)

            if (error) throw new Error(error.message)
            const page = (data || []) as DetailRow[]
            rows.push(...page)
            if (page.length < DETAIL_PAGE) break
            from += DETAIL_PAGE
        }
    }
    return rows
}

async function fetchProductNames(sb: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    const unique = [...new Set(ids.filter(Boolean))]
    for (let i = 0; i < unique.length; i += 200) {
        const chunk = unique.slice(i, i + 200)
        const { data, error } = await sb.from('products').select('id, name').in('id', chunk)
        if (error) throw new Error(error.message)
        for (const p of (data || []) as ProductRow[]) {
            map.set(String(p.id), String(p.name || '').trim())
        }
    }
    return map
}

export function aggregateManufacturingPlanByCode(
    details: DetailRow[],
    productNames: Map<string, string>,
): ManufacturingPlanRow[] {
    type Acc = {
        id: string
        name: string | null
        spec: string | null
        product_codes: Set<string>
        specs: Set<string>
        total_quantity: number
        amount: number
        cost_amount: number
        is_unregistered: boolean
        detail_count: number
    }

    const map = new Map<string, Acc>()

    for (const d of details) {
        if (d.exclude_from_total) continue

        const label = resolveDetailLabel(d, productNames)
        if (!label) continue

        const qty = Number(d.quantity ?? 0) || 0
        const amount = Number(d.amount ?? 0) || 0
        const cost = Number(d.cost_amount ?? 0) || 0

        const id = label.isUnregistered ? unregisteredAggregateKey(label.name) : label.productId
        const prev = map.get(id)

        if (!prev) {
            const codes = new Set<string>()
            if (label.productId) codes.add(label.productId)
            map.set(id, {
                id,
                name: label.name,
                spec: label.spec || null,
                product_codes: codes,
                specs: new Set(label.spec ? [label.spec] : []),
                total_quantity: qty,
                amount,
                cost_amount: cost,
                is_unregistered: label.isUnregistered,
                detail_count: 1,
            })
        } else {
            prev.total_quantity += qty
            prev.amount += amount
            prev.cost_amount += cost
            prev.detail_count += 1
            if (label.productId) prev.product_codes.add(label.productId)
            if (label.spec) prev.specs.add(label.spec)
            if (!prev.name && label.name) prev.name = label.name
            prev.is_unregistered = prev.is_unregistered && label.isUnregistered
        }
    }

    return finalizeRows(
        Array.from(map.values()).map((row) => ({
            ...row,
            spec: row.specs.size === 1 ? Array.from(row.specs)[0] : row.specs.size > 1 ? '（複数）' : row.spec,
        })),
    )
}

export function aggregateManufacturingPlanByNameSpec(
    details: DetailRow[],
    productNames: Map<string, string>,
): ManufacturingPlanRow[] {
    type Item = {
        name: string
        spec: string
        productId: string
        isUnregistered: boolean
        quantity: number
        amount: number
        cost: number
    }

    const items: Item[] = []
    for (const d of details) {
        if (d.exclude_from_total) continue
        const label = resolveDetailLabel(d, productNames)
        if (!label) continue
        items.push({
            name: label.name,
            spec: label.spec,
            productId: label.productId,
            isUnregistered: label.isUnregistered,
            quantity: Number(d.quantity ?? 0) || 0,
            amount: Number(d.amount ?? 0) || 0,
            cost: Number(d.cost_amount ?? 0) || 0,
        })
    }

    if (items.length === 0) return []

    const parent = items.map((_, i) => i)
    const find = (x: number): number => {
        if (parent[x] !== x) parent[x] = find(parent[x])
        return parent[x]
    }
    const union = (a: number, b: number) => {
        const ra = find(a)
        const rb = find(b)
        if (ra !== rb) parent[rb] = ra
    }

    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            if (isSimilarNameOrSpec(items[i].name, items[i].spec, items[j].name, items[j].spec)) {
                union(i, j)
            }
        }
    }

    type Acc = {
        id: string
        name: string
        specs: Set<string>
        product_codes: Set<string>
        total_quantity: number
        amount: number
        cost_amount: number
        is_unregistered: boolean
        detail_count: number
    }

    const map = new Map<number, Acc>()

    for (let i = 0; i < items.length; i++) {
        const root = find(i)
        const item = items[i]
        const prev = map.get(root)

        if (!prev) {
            const codes = new Set<string>()
            if (item.productId) codes.add(item.productId)
            map.set(root, {
                id: `grp:${root}`,
                name: item.name,
                specs: new Set(item.spec ? [item.spec] : []),
                product_codes: codes,
                total_quantity: item.quantity,
                amount: item.amount,
                cost_amount: item.cost,
                is_unregistered: item.isUnregistered,
                detail_count: 1,
            })
        } else {
            prev.name = pickLongerDisplayName(prev.name, item.name)
            if (item.spec) prev.specs.add(item.spec)
            if (item.productId) prev.product_codes.add(item.productId)
            prev.total_quantity += item.quantity
            prev.amount += item.amount
            prev.cost_amount += item.cost
            prev.detail_count += 1
            prev.is_unregistered = prev.is_unregistered && item.isUnregistered
        }
    }

    return finalizeRows(
        Array.from(map.entries()).map(([root, row]) => ({
            ...row,
            id: `grp:${root}`,
            spec:
                row.specs.size === 0
                    ? null
                    : row.specs.size === 1
                      ? Array.from(row.specs)[0]
                      : '（複数）',
        })),
    )
}

export function aggregateManufacturingPlanDetails(
    details: DetailRow[],
    productNames: Map<string, string>,
    groupBy: ManufacturingPlanGroupBy = 'code',
): ManufacturingPlanRow[] {
    if (groupBy === 'name_spec') {
        return aggregateManufacturingPlanByNameSpec(details, productNames)
    }
    return aggregateManufacturingPlanByCode(details, productNames)
}

export async function fetchManufacturingPlanAggregated(
    sb: SupabaseClient,
    input: { from?: string | null; to?: string | null; groupBy?: ManufacturingPlanGroupBy },
): Promise<{
    rows: ManufacturingPlanRow[]
    caseCount: number
    detailCount: number
    unlinkedDetailCount: number
    groupBy: ManufacturingPlanGroupBy
}> {
    const from = parseDateParam(input.from)
    const to = parseDateParam(input.to)
    const groupBy = input.groupBy === 'name_spec' ? 'name_spec' : 'code'

    const details = await fetchDetailsInRange(sb, from, to)
    const caseIds = new Set(details.map((d) => d.case_id))
    const unlinkedDetailCount = details.filter(
        (d) => !d.exclude_from_total && !String(d.product_id || '').trim() && String(d.unregistered_product || '').trim(),
    ).length

    const productIds = details.map((d) => String(d.product_id || '').trim()).filter(Boolean)
    const productNames = await fetchProductNames(sb, productIds)
    const rows = aggregateManufacturingPlanDetails(details, productNames, groupBy)

    return {
        rows,
        caseCount: caseIds.size,
        detailCount: details.length,
        unlinkedDetailCount,
        groupBy,
    }
}

/** RPC は商品コード単位のみ。name_spec はアプリ側集計 */
export async function fetchManufacturingPlanAggregatedWithFallback(
    sb: SupabaseClient,
    input: { from?: string | null; to?: string | null; groupBy?: ManufacturingPlanGroupBy },
): Promise<{
    rows: ManufacturingPlanRow[]
    caseCount: number
    detailCount: number
    unlinkedDetailCount: number
    groupBy: ManufacturingPlanGroupBy
    source: 'rpc' | 'app'
}> {
    const groupBy = input.groupBy === 'name_spec' ? 'name_spec' : 'code'

    if (groupBy === 'code') {
        const from = parseDateParam(input.from)
        const to = parseDateParam(input.to)

        const { data, error } = await sb.rpc('get_manufacturing_plan_aggregated', {
            _from: from,
            _to: to,
        })

        if (!error && Array.isArray(data)) {
            const rows = (data as ManufacturingPlanRow[]).map((r) => ({
                id: String(r.id),
                name: r.name ?? null,
                spec: null,
                product_codes: [String(r.id)],
                total_quantity: Number(r.total_quantity ?? 0) || 0,
                amount: Number(r.amount ?? 0) || 0,
                cost_amount: Number(r.cost_amount ?? 0) || 0,
                avg_unit_price:
                    r.avg_unit_price != null
                        ? Number(r.avg_unit_price)
                        : Number(r.total_quantity) > 0
                          ? Number(r.amount) / Number(r.total_quantity)
                          : null,
                is_unregistered: Boolean(r.is_unregistered),
                detail_count: Number(r.detail_count ?? 0) || 0,
            }))
            const unlinkedDetailCount = rows
                .filter((r) => r.is_unregistered)
                .reduce((s, r) => s + r.detail_count, 0)
            return {
                rows: sortManufacturingPlanRows(rows),
                caseCount: 0,
                detailCount: rows.reduce((s, r) => s + r.detail_count, 0),
                unlinkedDetailCount,
                groupBy,
                source: 'rpc',
            }
        }
    }

    const app = await fetchManufacturingPlanAggregated(sb, { ...input, groupBy })
    return { ...app, source: 'app' }
}

export { inDateRange, parseDateParam }
