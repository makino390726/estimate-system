/** 担当者名照合用: 半角・全角スペース・NFKC 正規化 */
export function normalizeStaffNameKey(name: string): string {
    return String(name || '')
        .normalize('NFKC')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim()
        .replace(/[\s\u3000\u00a0\u2000-\u200a\u202f\u205f]+/g, '')
}

export type StaffNameRow = {
    id: string
    name: string
}

/**
 * 入力名を staffs.name の正規表記に解決する。
 * 完全一致を優先し、なければ空白除去後の一致で探す。
 */
export function resolveStaffName(input: string, staffNames: readonly string[]): string | null {
    const trimmed = String(input || '')
        .normalize('NFKC')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim()
    if (!trimmed) return null

    if (staffNames.includes(trimmed)) return trimmed

    const key = normalizeStaffNameKey(trimmed)
    if (!key) return null

    const found = staffNames.find((n) => normalizeStaffNameKey(n) === key)
    return found ?? null
}

/** staff_id 優先、なければ staff_name で staffs 行を解決 */
export function resolveStaffRecord(
    input: { staff_id?: string | null; staff_name?: string | null },
    staffRows: readonly StaffNameRow[],
): StaffNameRow | null {
    const staffId = String(input.staff_id ?? '').trim()
    if (staffId) {
        const row = staffRows.find((s) => String(s.id) === staffId)
        if (!row) return null
        const name = String(row.name || '').trim()
        return name ? { id: staffId, name } : null
    }

    const rawName = String(input.staff_name ?? '').trim()
    if (!rawName) return null

    const names = staffRows.map((s) => String(s.name || '').trim()).filter(Boolean)
    const canonical = resolveStaffName(rawName, names)
    if (!canonical) return null

    const row = staffRows.find((s) => {
        const n = String(s.name || '').trim()
        return n === canonical || normalizeStaffNameKey(n) === normalizeStaffNameKey(canonical)
    })
    if (row) {
        return { id: String(row.id), name: String(row.name || '').trim() || canonical }
    }
    return null
}

/** エラー表示用: 名前が近い候補（最大5件） */
export function findSimilarStaffNames(
    input: string,
    staffRows: readonly StaffNameRow[],
    limit = 5,
): string[] {
    const key = normalizeStaffNameKey(input)
    if (!key || key.length < 2) return []

    const scored = staffRows
        .map((s) => {
            const n = String(s.name || '').trim()
            const nk = normalizeStaffNameKey(n)
            if (!nk) return { n, score: 0 }
            if (nk === key) return { n, score: 100 }
            if (nk.includes(key) || key.includes(nk)) return { n, score: 50 }
            return { n, score: 0 }
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)

    return [...new Set(scored.map((x) => x.n))].slice(0, limit)
}
