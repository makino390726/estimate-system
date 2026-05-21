/** 営業所マスタ（repair_requests.assigned_branch） */
export const BRANCHES = [
    { id: 'branch_1', name: '南九州営業所' },
    { id: 'branch_2', name: '中九州営業所' },
    { id: 'branch_3', name: '西九州営業所' },
    { id: 'branch_4', name: '東日本営業所' },
    { id: 'branch_5', name: '沖縄出張所' },
    { id: 'branch_6', name: '東北出張所' },
] as const

/** LIFF修理フォーム用：営業所以外（企画部など）への依頼 */
export const BRANCH_OTHER_ID = 'branch_other' as const
export const BRANCH_OTHER_NAME = 'その他'

/** 通常営業所＋その他（LINE修理依頼フォームのプルダウン） */
export const LIFF_REPAIR_BRANCH_OPTIONS = [
    ...BRANCHES,
    { id: BRANCH_OTHER_ID, name: BRANCH_OTHER_NAME },
] as const

export type BranchId = (typeof BRANCHES)[number]['id']

const SALES_BRANCH_IDS = new Set<string>(BRANCHES.map((b) => b.id))

export const BRANCH_NAMES: Record<string, string> = {
    ...Object.fromEntries(BRANCHES.map((b) => [b.id, b.name])),
    [BRANCH_OTHER_ID]: BRANCH_OTHER_NAME,
}

export function isBranchOther(branchId: string | null | undefined): boolean {
    return branchId === BRANCH_OTHER_ID
}

export function isSalesBranchId(branchId: string | null | undefined): boolean {
    return Boolean(branchId && SALES_BRANCH_IDS.has(branchId))
}

export function getBranchName(branchId: string | null | undefined): string {
    if (!branchId) return '未割当'
    return BRANCH_NAMES[branchId] || branchId
}

/** 各営業所の部署名エイリアス（所属判定用） */
export function getAllSalesOfficeDepartmentNames(): Set<string> {
    const names = new Set<string>()
    for (const b of BRANCHES) {
        for (const d of getStaffDepartmentsForBranch(b.id)) {
            names.add(d)
        }
    }
    return names
}

/** いずれの営業所にも所属しない担当者（企画部・管理部など） */
export function isStaffOutsideSalesBranches(staff: {
    branch_id?: string | null
    department?: string | null
}): boolean {
    const branchId = typeof staff.branch_id === 'string' ? staff.branch_id.trim() : ''
    if (branchId && SALES_BRANCH_IDS.has(branchId)) return false

    const dept = typeof staff.department === 'string' ? staff.department.trim() : ''
    if (dept && getAllSalesOfficeDepartmentNames().has(dept)) return false

    return true
}

/**
 * 修理案件の管轄営業所 → 担当者マスタの「部署」で照合する名称
 * （部署マスタと営業所名の表記ゆれを吸収）
 */
export function getStaffDepartmentsForBranch(branchId: string | null | undefined): string[] {
    if (!branchId || isBranchOther(branchId)) return []
    const aliases: Record<string, string[]> = {
        branch_1: ['南九州営業所'],
        branch_2: ['中九州営業所'],
        branch_3: ['西九州営業所', '福岡営業所'],
        branch_4: ['東日本営業所', '東日本出張所'],
        branch_5: ['沖縄出張所'],
        branch_6: ['東北出張所'],
    }
    return aliases[branchId] || [getBranchName(branchId)]
}
