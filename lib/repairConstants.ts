/** 修理案件のステータス表示・遷移（PC・モバイル共通） */

export const REPAIR_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    received: { label: '受付', color: '#60a5fa', bg: '#1e3a5f' },
    staff_confirmed: { label: '担当者確認', color: '#2dd4bf', bg: '#134e4a' },
    confirming: { label: '確認中', color: '#fbbf24', bg: '#4a3728' },
    phone_done: { label: '電話対応済', color: '#a78bfa', bg: '#3b2e5a' },
    visit_scheduled: { label: '出張予定', color: '#fb923c', bg: '#4a3020' },
    parts_waiting: { label: '部品待ち', color: '#f87171', bg: '#4a2020' },
    repairing: { label: '修理中', color: '#38bdf8', bg: '#1e3a5f' },
    completed: { label: '修理完了', color: '#4ade80', bg: '#1a3a2a' },
    billed: { label: '請求済', color: '#818cf8', bg: '#2e2e5a' },
    closed: { label: 'クローズ', color: '#94a3b8', bg: '#334155' },
}

export const REPAIR_PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
    urgent: { label: '緊急', color: '#ef4444' },
    high: { label: '高', color: '#f97316' },
    normal: { label: '通常', color: '#60a5fa' },
    low: { label: '低', color: '#94a3b8' },
}

const STATUS_FLOW: Record<string, string[]> = {
    received: ['staff_confirmed', 'confirming', 'phone_done', 'visit_scheduled'],
    staff_confirmed: ['confirming', 'phone_done', 'visit_scheduled'],
    confirming: ['phone_done', 'visit_scheduled', 'parts_waiting'],
    phone_done: ['visit_scheduled', 'parts_waiting', 'completed'],
    visit_scheduled: ['repairing', 'parts_waiting'],
    parts_waiting: ['visit_scheduled', 'repairing'],
    repairing: ['completed', 'parts_waiting'],
    completed: ['billed'],
    billed: ['closed'],
    closed: [],
}

/** PC 修理案件管理用 */
export function getRepairNextStatuses(current: string): string[] {
    return STATUS_FLOW[current] || []
}

/** 現場スマホ向け（よく使う遷移のみ） */
export const MOBILE_QUICK_STATUSES = ['visit_scheduled', 'repairing', 'parts_waiting', 'completed'] as const

export function getMobileSuggestedStatuses(current: string): string[] {
    const quick = MOBILE_QUICK_STATUSES.filter((s) => s !== current)
    const fromFlow = (STATUS_FLOW[current] || []).filter((s) =>
        MOBILE_QUICK_STATUSES.includes(s as (typeof MOBILE_QUICK_STATUSES)[number]),
    )
    const merged = [...new Set([...fromFlow, ...quick])]
    return merged.filter((s) => s !== current)
}

export const ACTIVE_REPAIR_STATUSES = [
    'received',
    'staff_confirmed',
    'confirming',
    'phone_done',
    'visit_scheduled',
    'parts_waiting',
    'repairing',
]
