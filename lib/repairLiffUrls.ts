/** 修理 LIFF（フォーム・LINE連携）の URL を組み立てる */

export function getRepairLiffBaseUrl(): string {
    const fromEnv = process.env.NEXT_PUBLIC_LIFF_URL || ''
    if (fromEnv.trim()) return fromEnv.trim().replace(/\/$/, '')
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID || ''
    if (liffId.trim()) return `https://liff.line.me/${liffId.trim()}`
    return ''
}

export function buildRepairFormLiffUrl(params?: {
    category?: string
    symptom?: string
    linkRepairId?: string
}): string {
    const base = getRepairLiffBaseUrl()
    if (!base) return ''
    const q = new URLSearchParams()
    if (params?.category?.trim()) q.set('category', params.category.trim())
    if (params?.symptom?.trim()) q.set('symptom', params.symptom.trim())
    if (params?.linkRepairId?.trim()) q.set('link_repair_id', params.linkRepairId.trim())
    const qs = q.toString()
    return qs ? `${base}?${qs}` : base
}

export function buildRepairLineLinkLiffUrl(repairRequestId: string): string {
    return buildRepairFormLiffUrl({ linkRepairId: repairRequestId })
}
