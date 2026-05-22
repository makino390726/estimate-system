/** 顧客向け表示用の交換部品（代金・単価は含めない） */

export type RepairPartExchangeLine = {
    part_name: string
    part_code?: string | null
    quantity?: number | null
}

/** 1行の交換明細（商品名・コード・数量のみ）— LINE 等 */
export function formatRepairPartExchangeLine(p: RepairPartExchangeLine): string {
    const name = String(p.part_name || '').trim() || '—'
    const code = String(p.part_code || '').trim()
    const qty = p.quantity != null && Number(p.quantity) > 0 ? Number(p.quantity) : 1
    const codePart = code ? ` (${code})` : ''
    return `・${name}${codePart} ${qty}`
}

/** 現場スマホ一覧用: 商品名 / コード 数量 */
export function formatRepairPartExchangeLineSlash(p: RepairPartExchangeLine): string {
    const name = String(p.part_name || '').trim() || '—'
    const code = String(p.part_code || '').trim() || '—'
    const qty = p.quantity != null && Number(p.quantity) > 0 ? Number(p.quantity) : 1
    return `${name} / ${code} ${qty}`
}

/** 交換明細テキスト（複数行）。部品代金・単価は含めない */
export function formatRepairPartsExchangeDetail(
    parts: RepairPartExchangeLine[],
    opts?: { heading?: string; emptyText?: string },
): string {
    const heading = opts?.heading ?? '【交換部品】'
    const empty = opts?.emptyText ?? ''
    const list = (parts || []).filter((p) => String(p.part_name || '').trim())
    if (list.length === 0) return empty
    return [heading, ...list.map(formatRepairPartExchangeLine)].join('\n')
}
