function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}

/** LIFF/修理フォームと同様：詳細が空なら症状分類を症状として使う */
export function resolveRepairSymptomText(
    symptom: string | null | undefined,
    symptomCategory: string | null | undefined,
): string {
    const detail = trim(symptom)
    const category = trim(symptomCategory)
    if (detail) return detail
    return category
}

/**
 * AI検索・Dify 用の症状テキスト。
 * 症状詳細未入力（LINE受付で分類のみ）でも symptom_category から検索できる。
 */
export function buildRepairSymptomQuery(parts: {
    symptom?: string | null
    symptom_category?: string | null
    symptom_detail?: string | null
}): string {
    const category = trim(parts.symptom_category)
    const detail =
        trim(parts.symptom_detail) ||
        trim(parts.symptom)

    if (detail && category && detail !== category) {
        return `症状分類: ${category}\n症状詳細: ${detail}`
    }
    if (detail) return detail
    if (category) return category
    return ''
}
