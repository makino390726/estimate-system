import type { SupabaseClient } from '@supabase/supabase-js'
import { BRANCH_OTHER_ID, getBranchName, isBranchOther, isSalesBranchId } from '@/lib/branches'

function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}

/** 完了報告の事務通知: repair_requests.assigned_branch → staff_office_notify_branches.branch_id */
export function resolveOfficeNotifyBranchId(assignedBranch: string | null | undefined): string {
    const b = trim(assignedBranch)
    if (!b) return BRANCH_OTHER_ID
    if (isSalesBranchId(b) || isBranchOther(b)) return b
    return BRANCH_OTHER_ID
}

export type OfficeNotifyStaffRow = {
    staff_id: string
    staff_name: string
    branch_id: string
    branch_label: string
}

/** 管轄営業所に紐づく事務処理担当者（is_repair_office_notify = true） */
export async function findRepairOfficeNotifyStaff(
    sb: SupabaseClient,
    assignedBranch: string | null | undefined,
): Promise<OfficeNotifyStaffRow[]> {
    const branchId = resolveOfficeNotifyBranchId(assignedBranch)

    const { data: branchRows, error: branchErr } = await sb
        .from('staff_office_notify_branches')
        .select('staff_id, branch_id')
        .eq('branch_id', branchId)

    if (branchErr) throw new Error(branchErr.message)
    if (!branchRows?.length) return []

    const staffIds = [...new Set(branchRows.map((r) => String(r.staff_id)))]
    const { data: staffRows, error: staffErr } = await sb
        .from('staffs')
        .select('id, name, is_repair_office_notify')
        .in('id', staffIds)

    if (staffErr) throw new Error(staffErr.message)

    const staffById = new Map(
        (staffRows || [])
            .filter((s) => s.is_repair_office_notify === true)
            .map((s) => [String(s.id), trim(s.name)]),
    )

    const branchLabel = getBranchName(branchId)
    const out: OfficeNotifyStaffRow[] = []
    for (const row of branchRows) {
        const sid = String(row.staff_id)
        const name = staffById.get(sid)
        if (!name) continue
        out.push({
            staff_id: sid,
            staff_name: name,
            branch_id: branchId,
            branch_label: branchLabel,
        })
    }

    const seen = new Set<string>()
    return out.filter((r) => {
        if (seen.has(r.staff_name)) return false
        seen.add(r.staff_name)
        return true
    })
}

/** branch_other を担当している staff_id（全社1名） */
export async function findStaffIdWithBranchOther(sb: SupabaseClient): Promise<string | null> {
    const { data, error } = await sb
        .from('staff_office_notify_branches')
        .select('staff_id')
        .eq('branch_id', BRANCH_OTHER_ID)
        .limit(1)
        .maybeSingle()

    if (error) throw new Error(error.message)
    return data?.staff_id != null ? String(data.staff_id) : null
}
