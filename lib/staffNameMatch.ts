/** 担当者名照合用: 半角・全角スペースなどを除去 */
export function normalizeStaffNameKey(name: string): string {
    return String(name || '')
        .trim()
        .replace(/[\s\u3000]+/g, '')
}

/**
 * 入力名を staffs.name の正規表記に解決する。
 * 完全一致を優先し、なければ空白除去後の一致で探す。
 */
export function resolveStaffName(input: string, staffNames: readonly string[]): string | null {
    const trimmed = String(input || '').trim()
    if (!trimmed) return null

    if (staffNames.includes(trimmed)) return trimmed

    const key = normalizeStaffNameKey(trimmed)
    if (!key) return null

    const found = staffNames.find((n) => normalizeStaffNameKey(n) === key)
    return found ?? null
}
