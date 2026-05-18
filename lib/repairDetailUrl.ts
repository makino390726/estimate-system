function trim(v: string | undefined) {
    return (v || '').trim()
}

/** 修理案件詳細モーダルを開く管理画面URL（担当者通知・メール用） */
export function getAppBaseUrl(): string {
    const isDevelopment = process.env.NODE_ENV !== 'production'
    return (
        (isDevelopment ? trim(process.env.LOCAL_BASE_URL) : trim(process.env.PROD_BASE_URL)) ||
        (isDevelopment ? 'http://localhost:3000' : 'https://estimate-system-ten.vercel.app')
    )
}

export function getRepairDetailUrl(repairRequestId: string): string {
    const base = getAppBaseUrl().replace(/\/$/, '')
    return `${base}/repair-requests?id=${encodeURIComponent(repairRequestId)}`
}
