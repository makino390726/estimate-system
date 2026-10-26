import type { SupabaseClient } from '@supabase/supabase-js'
import { historyNameKey } from '@/lib/customerRegisterExcelImport'
import { getSheetTypeLabel, repairCategoryToSheetType } from '@/lib/customerRegisterSheetTypes'

type RepairCustomer = {
    customer_name: string | null
    customer_address: string | null
    customer_phone: string | null
    customer_mobile: string | null
    assigned_staff: string | null
    model: string | null
    category: string | null
    received_at: string | null
}

type ServiceCustomer = {
    customer_name: string | null
    address: string | null
    phone: string | null
    mobile: string | null
    staff_name: string | null
    model: string | null
    category: string | null
    work_date: string | null
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}

async function loadPages<T>(
    load: (from: number, to: number) => Promise<T[]>,
    pageSize = 500,
): Promise<T[]> {
    const out: T[] = []
    let from = 0
    while (from < 20000) {
        const batch = await load(from, from + pageSize - 1)
        out.push(...batch)
        if (batch.length < pageSize) break
        from += pageSize
    }
    return out
}

function nameAlreadyCovered(key: string, known: Set<string>): boolean {
    if (!key) return true
    for (const existing of known) {
        if (existing === key) return true
        const short = existing.length <= key.length ? existing : key
        const long = existing.length <= key.length ? key : existing
        if (short.length >= 4 && long.includes(short)) return true
    }
    return false
}

/** 修理案件・出張修理にある顧客で、カルテ行がまだない人を製造番号なしで1件ずつ保存する */
export async function ensureCustomerChartsFromRepairs(
    sb: SupabaseClient,
): Promise<{ created: number; removed: number }> {
    let repairs: RepairCustomer[] = []
    try {
        repairs = await loadPages<RepairCustomer>(async (from, to) => {
            const { data, error } = await sb
                .from('repair_requests')
                .select('customer_name, customer_address, customer_phone, customer_mobile, assigned_staff, model, category, received_at')
                .order('received_at', { ascending: false })
                .range(from, to)
            if (error) throw error
            return (data || []) as RepairCustomer[]
        })
    } catch (error) {
        console.error('修理案件からのカルテ作成:', error)
    }

    const reports = await loadPages<ServiceCustomer>(async (from, to) => {
        const { data, error } = await sb
            .from('service_repair_reports')
            .select('customer_name, address, phone, mobile, staff_name, model, category, work_date')
            .order('work_date', { ascending: false })
            .range(from, to)
        if (error) throw error
        return (data || []) as ServiceCustomer[]
    })

    const charts = await loadPages<{
        id: string
        customer_name: string | null
        serial_no: string | null
        manufacturing_no: string | null
        raw_data: { source?: string } | null
    }>(async (from, to) => {
        const { data, error } = await sb
            .from('customer_register_rows')
            .select('id, customer_name, serial_no, manufacturing_no, raw_data')
            .order('id')
            .range(from, to)
        if (error) throw error
        return (data || []) as {
            id: string
            customer_name: string | null
            serial_no: string | null
            manufacturing_no: string | null
            raw_data: { source?: string } | null
        }[]
    })

    const generatedSources = new Set(['service_repair_report', 'repair_request'])
    const byName = new Map<string, typeof charts>()
    for (const row of charts) {
        const key = historyNameKey(row.customer_name)
        if (!key) continue
        const list = byName.get(key) || []
        list.push(row)
        byName.set(key, list)
    }
    const duplicateIds: string[] = []
    for (const list of byName.values()) {
        const generated = list.filter((row) => {
            const hasSerial = Boolean(row.serial_no?.trim() || row.manufacturing_no?.trim())
            return !hasSerial && generatedSources.has(String(row.raw_data?.source || ''))
        })
        if (generated.length === 0) continue
        const drop = list.length > generated.length ? generated : generated.slice(1)
        for (const row of drop) duplicateIds.push(row.id)
    }
    for (const part of chunk(duplicateIds, 80)) {
        const { error } = await sb.from('customer_register_rows').delete().in('id', part)
        if (error) throw error
    }

    const known = new Set(charts.map((row) => historyNameKey(row.customer_name)).filter(Boolean))
    const pending = new Map<string, {
        customer_name: string
        address: string | null
        phone: string | null
        mobile: string | null
        staff_name: string | null
        model: string | null
        category: string | null
        source: 'repair_request' | 'service_repair_report'
    }>()

    const remember = (
        name: string | null,
        row: {
            address: string | null
            phone: string | null
            mobile: string | null
            staff_name: string | null
            model: string | null
            category: string | null
            source: 'repair_request' | 'service_repair_report'
        },
    ) => {
        const key = historyNameKey(name)
        const customerName = String(name || '').trim()
        if (!customerName || !key || nameAlreadyCovered(key, known) || pending.has(key)) return
        pending.set(key, { ...row, customer_name: customerName })
        known.add(key)
    }

    for (const repair of repairs) {
        remember(repair.customer_name, {
            address: repair.customer_address,
            phone: repair.customer_phone,
            mobile: repair.customer_mobile,
            staff_name: repair.assigned_staff,
            model: repair.model,
            category: repair.category,
            source: 'repair_request',
        })
    }
    for (const report of reports) {
        remember(report.customer_name, {
            address: report.address,
            phone: report.phone,
            mobile: report.mobile,
            staff_name: report.staff_name,
            model: report.model,
            category: report.category,
            source: 'service_repair_report',
        })
    }

    const now = new Date().toISOString()
    const rows = [...pending.values()].map((customer) => {
        const sheetType = repairCategoryToSheetType(customer.category)
        return {
            customer_name: customer.customer_name,
            address: customer.address,
            phone: customer.phone,
            mobile: customer.mobile,
            staff_name: customer.staff_name,
            model: customer.model,
            serial_no: null,
            manufacturing_no: null,
            sheet_type: sheetType,
            sheet_name: getSheetTypeLabel(sheetType),
            raw_data: { source: customer.source },
            created_at: now,
            updated_at: now,
        }
    })

    let created = 0
    for (const part of chunk(rows, 50)) {
        const { error } = await sb.from('customer_register_rows').insert(part)
        if (error) throw error
        created += part.length
    }
    return { created, removed: duplicateIds.length }
}
