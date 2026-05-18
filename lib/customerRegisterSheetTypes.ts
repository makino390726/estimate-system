/**
 * 顧客登録（customer_register_rows.sheet_type）と機械カルテ・修理分野の共通定義
 */

export const SHEET_TYPE_OPTIONS = [
    { value: 'heating', label: '暖房機' },
    { value: 'co2_device', label: '光合成促進装置' },
    { value: 'food_dryer', label: '食品乾燥機' },
    { value: 'soumen_dryer', label: 'ソーメン乾燥機' },
    { value: 'leaf_dryer', label: '薬草乾燥機' },
    { value: 'sweetpotato_dryer', label: '干し芋乾燥機' },
    { value: 'tobacco_dryer', label: 'たばこ乾燥機' },
    { value: 'cooling_equipment', label: '冷熱機器' },
    { value: 'unknown', label: 'その他' },
] as const

export type SheetTypeValue = (typeof SHEET_TYPE_OPTIONS)[number]['value']

export function getSheetTypeLabel(value: string | null | undefined): string {
    const v = String(value || '').trim()
    if (!v) return 'その他'
    const hit = SHEET_TYPE_OPTIONS.find((o) => o.value === v)
    return hit?.label || v
}

/** 旧修理フォーム等の日本語ラベル → sheet_type */
const REPAIR_CATEGORY_JA_TO_SHEET: Record<string, string> = {
    たばこ乾燥機: 'tobacco_dryer',
    ハウス暖房機: 'heating',
    光合成促進装置: 'co2_device',
    冷蔵庫: 'cooling_equipment',
    食品乾燥機: 'food_dryer',
    その他: 'unknown',
}

/**
 * repair_requests.category 等の値を顧客登録の sheet_type に正規化する。
 * 既に sheet_type コードの場合はそのまま、旧データの日本語も吸収する。
 */
export function repairCategoryToSheetType(category: string | null | undefined): string {
    const t = String(category || '').trim()
    if (!t) return 'unknown'
    if (SHEET_TYPE_OPTIONS.some((o) => o.value === t)) return t
    const mapped = REPAIR_CATEGORY_JA_TO_SHEET[t]
    if (mapped) return mapped
    const byLabel = SHEET_TYPE_OPTIONS.find((o) => o.label === t)
    if (byLabel) return byLabel.value
    return 'unknown'
}

/** 修理画面・メール等の表示用（常にマスタの日本語ラベル） */
export function formatRepairCategoryDisplay(category: string | null | undefined): string {
    if (!category) return '-'
    return getSheetTypeLabel(repairCategoryToSheetType(category))
}

/** LINE 経由の修理を顧客登録の販売店欄に載せる短文 */
export function buildRepairDealerNameForCustomerRegister(fd: {
    received_via: string
    notes: string
    customer_phone: string
}): string | null {
    if (fd.received_via !== 'line') return null
    const parts: string[] = ['LINE修理受付']
    const firstLine = fd.notes.trim().split('\n').find(Boolean)
    if (firstLine) {
        parts.push(firstLine.length > 120 ? `${firstLine.slice(0, 120)}…` : firstLine)
    }
    const tel = fd.customer_phone.trim()
    if (tel) parts.push(`連絡先TEL: ${tel}`)
    return parts.join(' ')
}
