import { getBranchName, getStaffDepartmentsForBranch } from '@/lib/branches'

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
    if (branchId && trim(staff.branch_id) === branchId) return true
    const dept = trim(staff.department)
    if (dept && departmentNames.includes(dept)) return true
    return false
}

export function resolveRepairNotifyScope(repair: { assigned_branch?: string | null }) {
    const branchId = trim(repair.assigned_branch) || null
    const departmentNames = branchId ? getStaffDepartmentsForBranch(branchId) : getFallbackDepartments()
    const branchLabel = branchId
        ? getBranchName(branchId)
        : `未割当（${departmentNames.join('・')}へ通知）`
    return { branchId, departmentNames, branchLabel }
}
