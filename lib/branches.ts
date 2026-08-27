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

const UNSET_SALES_OFFICE_LABEL = '部署未設定'

/** ノルマ・年度計画用。修理の営業所マスタ（BRANCHES）には含めない */
export const QUOTA_ONLY_OFFICES = [
    { id: 'quota_purchasing', name: '管理部（購買）' },
    { id: 'quota_planning', name: '企画部（SE・海外）' },
] as const

function quotaOfficeAliases(id: (typeof QUOTA_ONLY_OFFICES)[number]['id']): string[] {
    if (id === 'quota_purchasing') return ['管理部', '管理部（購買）', '購買']
    return ['企画部', '企画部（SE・海外）', 'SE・海外']
}

function allQuotaOffices(): Array<{ id: string; name: string }> {
    return [...BRANCHES, ...QUOTA_ONLY_OFFICES]
}

/** 担当者マスタの部署・所属営業所から、年度計画の集計用営業所名を返す */
export function salesOfficeLabelFromStaff(staff: {
    department?: string | null
    branch_id?: string | null
}): string {
    const dept = typeof staff.department === 'string' ? staff.department.trim() : ''
    if (dept) {
        for (const b of BRANCHES) {
            const aliases = getStaffDepartmentsForBranch(b.id)
            if (dept === b.name || aliases.includes(dept)) return b.name
        }
        for (const o of QUOTA_ONLY_OFFICES) {
            if (quotaOfficeAliases(o.id).includes(dept)) return o.name
        }
        return dept
    }
    const branchId = typeof staff.branch_id === 'string' ? staff.branch_id.trim() : ''
    if (branchId && isSalesBranchId(branchId)) return getBranchName(branchId)
    return UNSET_SALES_OFFICE_LABEL
}

/** ノルマ保存キー。営業所マスタとノルマ専用部署以外は null */
export function officeKeyFromStaff(staff: {
    department?: string | null
    branch_id?: string | null
}): string | null {
    return officeKeyFromLabel(salesOfficeLabelFromStaff(staff))
}

export function officeKeyFromLabel(label: string): string | null {
    const found = allQuotaOffices().find((b) => b.name === label)
    return found ? found.id : null
}

export function compareSalesOfficeLabel(a: string, b: string): number {
    const order = (label: string) => {
        const i = allQuotaOffices().findIndex((x) => x.name === label)
        if (i >= 0) return i
        if (label === UNSET_SALES_OFFICE_LABEL) return 1000
        return 100
    }
    const d = order(a) - order(b)
    if (d !== 0) return d
    return a.localeCompare(b, 'ja')
}
