import {
    getBranchName,
    getStaffDepartmentsForBranch,
    isBranchOther,
    isStaffOutsideSalesBranches,
} from '@/lib/branches'
import { resolveStaffName } from '@/lib/staffNameMatch'

const DEFAULT_FALLBACK_DEPARTMENTS = ['管理部', '技術部'] as const

function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}

function getFallbackDepartments(): string[] {
    const env = trim(process.env.REPAIR_NOTIFY_FALLBACK_DEPARTMENTS)
    if (env) return env.split(',').map((s) => s.trim()).filter(Boolean)
    return [...DEFAULT_FALLBACK_DEPARTMENTS]
}

export type RepairNotifyStaffRow = {
    name: string
    email: string | null
    department: string | null
    branch_id: string | null
}

export function staffMatchesRepairBranch(
    staff: RepairNotifyStaffRow,
    branchId: string | null,
    departmentNames: string[],
): boolean {
    if (isBranchOther(branchId)) {
        return isStaffOutsideSalesBranches(staff)
    }
    if (branchId && trim(staff.branch_id) === branchId) return true
    const dept = trim(staff.department)
    if (dept && departmentNames.includes(dept)) return true
    return false
}

export function resolveRepairNotifyScope(repair: { assigned_branch?: string | null }) {
    const branchId = trim(repair.assigned_branch) || null
    const departmentNames = branchId
        ? isBranchOther(branchId)
            ? []
            : getStaffDepartmentsForBranch(branchId)
        : getFallbackDepartments()
    const branchLabel = branchId
        ? getBranchName(branchId)
        : `未割当（${departmentNames.join('・')}へ通知）`
    return { branchId, departmentNames, branchLabel }
}

/** 修理案件の管轄担当者名一覧（assigned_staff 指定時はその担当者を優先） */
export function resolveRepairNotifyStaffNames(
    repair: { assigned_staff?: string | null },
    staffRows: RepairNotifyStaffRow[],
    branchId: string | null,
    departmentNames: string[],
): string[] {
    const assignedStaff = trim(repair.assigned_staff)
    const allStaffNames = staffRows.map((s) => trim(s.name)).filter(Boolean)
    let matchedStaff = staffRows.filter((s) =>
        staffMatchesRepairBranch(s, branchId, departmentNames),
    )
    if (assignedStaff) {
        const resolved = resolveStaffName(assignedStaff, allStaffNames)
        if (resolved) return [resolved]
        // staffs に無くても案件の assigned_staff で LINE WORKS 連携を探す
        return [assignedStaff]
    }
    return matchedStaff.map((s) => trim(s.name)).filter(Boolean)
}
