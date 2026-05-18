/** 営業所マスタ（repair_requests.assigned_branch） */
export const BRANCHES = [
    { id: 'branch_1', name: '南九州営業所' },
    { id: 'branch_2', name: '中九州営業所' },
    { id: 'branch_3', name: '西九州営業所' },
    { id: 'branch_4', name: '東日本営業所' },
    { id: 'branch_5', name: '沖縄出張所' },
    { id: 'branch_6', name: '東北出張所' },
] as const

export type BranchId = (typeof BRANCHES)[number]['id']

export const BRANCH_NAMES: Record<string, string> = Object.fromEntries(
    BRANCHES.map((b) => [b.id, b.name]),
)

export function getBranchName(branchId: string | null | undefined): string {
    if (!branchId) return '未割当'
    return BRANCH_NAMES[branchId] || branchId
}

/**
 * 修理案件の管轄営業所 → 担当者マスタの「部署」で照合する名称
 * （部署マスタと営業所名の表記ゆれを吸収）
 */
export function getStaffDepartmentsForBranch(branchId: string | null | undefined): string[] {
    if (!branchId) return []
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
