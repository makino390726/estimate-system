import type { SupabaseClient } from '@supabase/supabase-js'
import {
    findMatchingCustomerRows,
    type CustomerRegisterMatchTarget,
    type ServiceRepairReportLite,
} from '@/lib/serviceRepairReportCustomerMatch'

const CUSTOMER_COLS =
    'id, customer_name, sheet_type, model, model_no, model_full, outlet_type, address, phone, mobile'

const REPORT_COLS =
    'id, branch_id, work_date, customer_name, address, phone, mobile, staff_name, category, model, treatment_details, remarks, customer_register_id'

export type LinkServiceReportsResult = {
    customersLoaded: number
    reportsScanned: number
    linked: number
    alreadyLinked: number
    skippedNoMatch: number
    skippedAmbiguous: number
    errors: string[]
}

async function loadAllCustomerRows(sb: SupabaseClient): Promise<CustomerRegisterMatchTarget[]> {
    const out: CustomerRegisterMatchTarget[] = []
    const pageSize = 500
    let from = 0
    while (true) {
        const { data, error } = await sb
            .from('customer_register_rows')
            .select(CUSTOMER_COLS)
            .order('id')
            .range(from, from + pageSize - 1)
        if (error) throw error
        const batch = (data || []) as CustomerRegisterMatchTarget[]
        out.push(...batch)
        if (batch.length < pageSize) break
        from += pageSize
    }
    return out
}

async function loadUnlinkedReports(sb: SupabaseClient): Promise<ServiceRepairReportLite[]> {
    const out: ServiceRepairReportLite[] = []
    const pageSize = 500
    let from = 0
    while (true) {
        const { data, error } = await sb
            .from('service_repair_reports')
            .select(REPORT_COLS)
            .is('customer_register_id', null)
            .order('work_date', { ascending: false })
            .range(from, from + pageSize - 1)
        if (error) throw error
        const batch = (data || []) as ServiceRepairReportLite[]
        out.push(...batch)
        if (batch.length < pageSize) break
        from += pageSize
    }
    return out
}

/**
 * 顧客名・機種・型式が一致し、カルテ行が1件に特定できる管理表のみ customer_register_id を設定する。
 */
export async function linkServiceReportsToCustomerRegister(
    sb: SupabaseClient,
): Promise<LinkServiceReportsResult> {
    const result: LinkServiceReportsResult = {
        customersLoaded: 0,
        reportsScanned: 0,
        linked: 0,
        alreadyLinked: 0,
        skippedNoMatch: 0,
        skippedAmbiguous: 0,
        errors: [],
    }

    const customers = await loadAllCustomerRows(sb)
    result.customersLoaded = customers.length

    const reports = await loadUnlinkedReports(sb)
    result.reportsScanned = reports.length

    for (const report of reports) {
        const matches = findMatchingCustomerRows(report, customers)
        if (matches.length === 0) {
            result.skippedNoMatch += 1
            continue
        }
        if (matches.length > 1) {
            result.skippedAmbiguous += 1
            continue
        }

        const { error } = await sb
            .from('service_repair_reports')
            .update({ customer_register_id: matches[0].id })
            .eq('id', report.id)
            .is('customer_register_id', null)

        if (error) {
            result.errors.push(`${report.id}: ${error.message}`)
            continue
        }
        result.linked += 1
    }

    return result
}

/** 紐づけ済み件数（参考） */
export async function countLinkedServiceReports(sb: SupabaseClient): Promise<number> {
    const { count, error } = await sb
        .from('service_repair_reports')
        .select('id', { count: 'exact', head: true })
        .not('customer_register_id', 'is', null)
    if (error) throw error
    return count ?? 0
}
