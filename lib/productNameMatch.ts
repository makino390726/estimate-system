export type ProductNameRow = {
    id: string
    name: string
}

/** 商品名照合用: NFKC・空白除去 */
export function normalizeProductNameKey(name: string): string {
    return String(name || '')
        .normalize('NFKC')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim()
        .replace(/[\s\u3000\u00a0\u2000-\u200a\u202f\u205f]+/g, '')
        .toLowerCase()
}

/**
 * 未登録商品名から products マスタの最適行を解決する。
 * 1. 正規化後の完全一致
 * 2. 未登録名に商品名が含まれる（最長一致）
 * 3. 商品名に未登録名が含まれる（4文字以上）
 */
/** 商品名＋規格の集計キー（全角半角・空白差を吸収） */
export function buildNameSpecKey(name: string, spec: string): string {
    const nk = normalizeProductNameKey(name)
    const sk = normalizeProductNameKey(spec)
    return `${nk}|${sk}`
}

/** 類似品判定: 正規化後の一致、または一方が他方を包含（4文字以上） */
export function isSimilarProductName(a: string, b: string): boolean {
    const ka = normalizeProductNameKey(a)
    const kb = normalizeProductNameKey(b)
    if (!ka || !kb) return false
    if (ka === kb) return true
    if (ka.length >= 4 && kb.length >= 4 && (ka.includes(kb) || kb.includes(ka))) return true
    return false
}

export function pickLongerDisplayName(a: string, b: string): string {
    const ta = String(a || '').trim()
    const tb = String(b || '').trim()
    if (!ta) return tb
    if (!tb) return ta
    return normalizeProductNameKey(ta).length >= normalizeProductNameKey(tb).length ? ta : tb
}

/** 商品名または規格のいずれかが類似していれば同一グループ */
export function isSimilarNameOrSpec(
    nameA: string,
    specA: string,
    nameB: string,
    specB: string,
): boolean {
    if (isSimilarProductName(nameA, nameB)) return true
    const sa = String(specA || '').trim()
    const sb = String(specB || '').trim()
    if (sa && sb && isSimilarProductName(sa, sb)) return true
    return false
}

export function resolveProductByUnregisteredName(
    unregistered: string,
    products: readonly ProductNameRow[],
): ProductNameRow | null {
    const key = normalizeProductNameKey(unregistered)
    if (!key) return null

    for (const p of products) {
        if (normalizeProductNameKey(p.name) === key) return p
    }

    let best: ProductNameRow | null = null
    let bestLen = 0
    for (const p of products) {
        const pk = normalizeProductNameKey(p.name)
        if (pk.length < 2) continue
        if (key.includes(pk) && pk.length > bestLen) {
            best = p
            bestLen = pk.length
        }
    }
    if (best) return best

    if (key.length >= 4) {
        for (const p of products) {
            const pk = normalizeProductNameKey(p.name)
            if (pk.includes(key)) return p
        }
    }

    return null
}
