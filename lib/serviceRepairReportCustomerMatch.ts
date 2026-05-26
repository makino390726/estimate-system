/** 出張修理管理表 ↔ 顧客カルテ行の照合（顧客名 + 機種 + 型式） */

import {
    repairCategoryToSheetType,
    SHEET_TYPE_OPTIONS,
    type SheetTypeValue,
} from '@/lib/customerRegisterSheetTypes'

export type ServiceRepairReportLite = {
    id: string
    branch_id: string
    work_date: string
    customer_name: string
    address: string | null
    phone: string | null
    mobile: string | null
    staff_name: string | null
    category: string | null
    model: string | null
    treatment_details: string | null
    remarks: string | null
}

export type CustomerRegisterMatchTarget = {
    id: string
    customer_name: string | null
    sheet_type: string | null
    model: string | null
    model_no: string | null
    model_full: string | null
    outlet_type: string | null
    address: string | null
    phone: string | null
    mobile: string | null
}

const normalizeMatchText = (value: unknown) =>
    String(value || '')
        .replace(/[\s　\-ー－]/g, '')
        .replace(/[()（）]/g, '')
        .toLowerCase()

/** 型式比較用（記号・空白を除去） */
const normalizeModelKey = (value: unknown) =>
    String(value || '')
        .replace(/[\s　\-ー－_./\\]/g, '')
        .replace(/[()（）]/g, '')
        .toLowerCase()

const MIN_MODEL_KEY_LEN = 3

function addModelKey(set: Set<string>, value: string | null | undefined) {
    const key = normalizeModelKey(value)
    if (key.length >= MIN_MODEL_KEY_LEN) set.add(key)
}

/** カルテ行から比較用型式キー一覧 */
export function collectCustomerModelKeys(row: CustomerRegisterMatchTarget): string[] {
    const keys = new Set<string>()
    addModelKey(keys, row.model_full)
    addModelKey(keys, row.model)
    addModelKey(keys, row.model_no)

    if (row.sheet_type === 'heating') {
        const left = (row.model || row.model_no || '').trim()
        const right = (row.outlet_type || '').trim()
        if (left && right) {
            addModelKey(keys, `${left}-${right}`)
            addModelKey(keys, `${left}${right}`)
        }
        addModelKey(keys, row.outlet_type)
    }

    return [...keys]
}

function modelKeysMatch(reportKey: string, rowKeys: string[]): boolean {
    if (reportKey.length < MIN_MODEL_KEY_LEN || rowKeys.length === 0) return false

    for (const rowKey of rowKeys) {
        if (rowKey === reportKey) return true
        if (rowKey.length >= 4 && reportKey.length >= 4) {
            if (rowKey.includes(reportKey) || reportKey.includes(rowKey)) return true
        }
        if (bigramDiceScore(reportKey, rowKey) >= 0.9) return true
    }
    return false
}

const bigramDiceScore = (leftRaw: string, rightRaw: string) => {
    const left = normalizeMatchText(leftRaw)
    const right = normalizeMatchText(rightRaw)
    if (!left || !right) return 0
    if (left === right) return 1
    if (left.includes(right) || right.includes(left)) return 0.92

    const toBigrams = (text: string) => {
        if (text.length < 2) return [text]
        const grams: string[] = []
        for (let i = 0; i < text.length - 1; i += 1) grams.push(text.slice(i, i + 2))
        return grams
    }

    const leftBigrams = toBigrams(left)
    const rightBigrams = toBigrams(right)
    const counts = new Map<string, number>()
    for (const gram of leftBigrams) counts.set(gram, (counts.get(gram) || 0) + 1)
    let overlap = 0
    for (const gram of rightBigrams) {
        const current = counts.get(gram) || 0
        if (current > 0) {
            overlap += 1
            counts.set(gram, current - 1)
        }
    }
    return (2 * overlap) / (leftBigrams.length + rightBigrams.length)
}

/** 管理表「分野」→ カルテ sheet_type */
const CATEGORY_PARTIAL: Array<{ keys: string[]; sheet: SheetTypeValue }> = [
    { keys: ['暖房', 'ハウス暖房'], sheet: 'heating' },
    { keys: ['光合成'], sheet: 'co2_device' },
    { keys: ['食品乾燥', '食品乾'], sheet: 'food_dryer' },
    { keys: ['ソーメン'], sheet: 'soumen_dryer' },
    { keys: ['薬草'], sheet: 'leaf_dryer' },
    { keys: ['干し芋'], sheet: 'sweetpotato_dryer' },
    { keys: ['たばこ', 'タバコ'], sheet: 'tobacco_dryer' },
    { keys: ['冷熱', '冷蔵'], sheet: 'cooling_equipment' },
]

export function serviceReportCategoryToSheetType(category: string | null | undefined): string {
    const t = String(category || '').trim()
    if (!t) return ''

    const fromRepair = repairCategoryToSheetType(t)
    if (fromRepair !== 'unknown') return fromRepair

    const compact = t.replace(/[\s　]/g, '')
    for (const opt of SHEET_TYPE_OPTIONS) {
        const label = opt.label.replace(/[\s　]/g, '')
        if (compact === label || compact.includes(label) || label.includes(compact)) {
            return opt.value
        }
    }
    for (const rule of CATEGORY_PARTIAL) {
        if (rule.keys.some((k) => compact.includes(k.replace(/[\s　]/g, '')))) {
            return rule.sheet
        }
    }
    return 'unknown'
}

function customerNameMatches(report: ServiceRepairReportLite, row: CustomerRegisterMatchTarget): boolean {
    const rowName = row.customer_name?.trim() || ''
    const reportName = report.customer_name?.trim() || ''
    if (!rowName || !reportName) return false

    const nameScore = bigramDiceScore(reportName, rowName)
    return nameScore >= 0.52
}

function machineTypeMatches(report: ServiceRepairReportLite, row: CustomerRegisterMatchTarget): boolean {
    const categoryRaw = report.category?.trim() || ''
    if (!categoryRaw) return false

    const reportSheet = serviceReportCategoryToSheetType(categoryRaw)
    if (!reportSheet || reportSheet === 'unknown') return false

    const rowSheet = String(row.sheet_type || '').trim() || 'unknown'
    if (rowSheet === 'unknown') return false

    return reportSheet === rowSheet
}

function modelTypeMatches(report: ServiceRepairReportLite, row: CustomerRegisterMatchTarget): boolean {
    const reportModelRaw = report.model?.trim() || ''
    if (!reportModelRaw) return false

    const reportKey = normalizeModelKey(reportModelRaw)
    const rowKeys = collectCustomerModelKeys(row)
    return modelKeysMatch(reportKey, rowKeys)
}

/** 顧客名・機種（分野）・型式が一致する管理表行のみ true */
export function serviceReportMatchesCustomer(
    report: ServiceRepairReportLite,
    row: CustomerRegisterMatchTarget,
): boolean {
    return customerNameMatches(report, row) && machineTypeMatches(report, row) && modelTypeMatches(report, row)
}

/** 1件の管理表行に対するカルテ候補（照合条件を満たす行すべて） */
export function findMatchingCustomerRows(
    report: ServiceRepairReportLite,
    rows: CustomerRegisterMatchTarget[],
): CustomerRegisterMatchTarget[] {
    return rows.filter((row) => serviceReportMatchesCustomer(report, row))
}

/** 候補レポートをカルテ行 id ごとに振り分け（作業日降順） */
export function linkServiceReportsToCustomerRows(
    reports: ServiceRepairReportLite[],
    rows: CustomerRegisterMatchTarget[],
): Record<string, ServiceRepairReportLite[]> {
    const byRow: Record<string, ServiceRepairReportLite[]> = {}
    for (const row of rows) {
        byRow[row.id] = []
    }

    for (const report of reports) {
        for (const row of rows) {
            if (!serviceReportMatchesCustomer(report, row)) continue
            const list = byRow[row.id]
            if (!list.some((x) => x.id === report.id)) list.push(report)
        }
    }

    for (const id of Object.keys(byRow)) {
        byRow[id].sort((a, b) => b.work_date.localeCompare(a.work_date))
    }
    return byRow
}
