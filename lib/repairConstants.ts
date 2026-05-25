/** 修理案件のステータス表示・遷移（PC・モバイル共通） */



/** 本システムで管理するステータス（受付→担当者確認→修理中→完了） */

export const REPAIR_MANAGED_STATUS_ORDER = [

    'received',

    'staff_confirmed',

    'repairing',

    'completed',

] as const



export type RepairManagedStatus = (typeof REPAIR_MANAGED_STATUS_ORDER)[number]



/** DB上の旧ステータス（表示のみ・新規遷移は修理中へ誘導） */

export const REPAIR_LEGACY_STATUSES = [

    'confirming',

    'phone_done',

    'visit_scheduled',

    'parts_waiting',

    'billed',

    'closed',

] as const



export const REPAIR_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {

    received: { label: '受付', color: '#60a5fa', bg: '#1e3a5f' },

    staff_confirmed: { label: '担当者確認', color: '#2dd4bf', bg: '#134e4a' },

    repairing: { label: '修理中', color: '#38bdf8', bg: '#1e3a5f' },

    completed: { label: '完了', color: '#4ade80', bg: '#1a3a2a' },

    // 旧データ用（一覧バッジのみ）

    confirming: { label: '確認中（旧）', color: '#fbbf24', bg: '#4a3728' },

    phone_done: { label: '電話対応済（旧）', color: '#a78bfa', bg: '#3b2e5a' },

    visit_scheduled: { label: '出張予定（旧）', color: '#fb923c', bg: '#4a3020' },

    parts_waiting: { label: '部品待ち（旧）', color: '#f87171', bg: '#4a2020' },

    billed: { label: '請求済（旧）', color: '#818cf8', bg: '#2e2e5a' },

    closed: { label: '終了（旧）', color: '#94a3b8', bg: '#334155' },

}



export const REPAIR_PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {

    urgent: { label: '緊急', color: '#ef4444' },

    high: { label: '高', color: '#f97316' },

    normal: { label: '通常', color: '#60a5fa' },

    low: { label: '低', color: '#94a3b8' },

}



const STATUS_FLOW: Record<string, string[]> = {

    received: ['staff_confirmed'],

    staff_confirmed: ['repairing'],

    repairing: [],

    completed: [],

    confirming: ['repairing'],

    phone_done: ['repairing'],

    visit_scheduled: ['repairing'],

    parts_waiting: ['repairing'],

    billed: [],

    closed: [],

}



/** 完了報告送信可能 */

export function canSubmitRepairCompletionReport(status: string): boolean {

    return status !== 'completed' && !isRepairFinishedStatus(status)

}



/** PC 修理案件管理：次に選べる中間ステータス（完了は専用ボタン） */

export function getRepairNextStatuses(current: string): string[] {

    return STATUS_FLOW[current] || []

}



/** 現場スマホ：修理中へのクイック変更のみ */

export const MOBILE_QUICK_STATUSES = ['repairing'] as const



const MOBILE_EXCLUDED_STATUSES = new Set<string>(['completed', 'closed', 'billed'])



export function getMobileSuggestedStatuses(current: string): string[] {

    if (current === 'received') return []

    if (current === 'staff_confirmed') return ['repairing']

    if (REPAIR_LEGACY_STATUSES.includes(current as (typeof REPAIR_LEGACY_STATUSES)[number])) {

        return current === 'repairing' ? [] : ['repairing']

    }

    const fromFlow = (STATUS_FLOW[current] || []).filter((s) =>

        MOBILE_QUICK_STATUSES.includes(s as (typeof MOBILE_QUICK_STATUSES)[number]),

    )

    return fromFlow.filter((s) => s !== current && !MOBILE_EXCLUDED_STATUSES.has(s))

}



export function getRepairStatusTransitionLabel(status: string): string {

    if (status === 'completed') return '完了報告送信'

    return REPAIR_STATUS_CONFIG[status]?.label ?? status

}



/** 完了報告済み・顧客承諾待ち */

export function isAwaitingCustomerAck(status: string): boolean {

    return status === 'completed'

}



export const ACTIVE_REPAIR_STATUSES: RepairManagedStatus[] = [

    'received',

    'staff_confirmed',

    'repairing',

]



/** 一覧の「完了案件」（旧 billed/closed も含む） */

export const FINISHED_REPAIR_STATUSES = ['completed', 'billed', 'closed'] as const



const TERMINAL_REPAIR_STATUSES = new Set<string>(FINISHED_REPAIR_STATUSES)



export function isRepairFinishedStatus(status: string): boolean {

    return TERMINAL_REPAIR_STATUSES.has(status)

}



export function isRepairLegacyStatus(status: string): boolean {

    return (REPAIR_LEGACY_STATUSES as readonly string[]).includes(status)

}



/** 完了後に「受付」等へ戻すダウングレードを防ぐ */

export function isAllowedRepairStatusTransition(from: string, to: string): boolean {

    if (from === to) return true

    if (!TERMINAL_REPAIR_STATUSES.has(from)) return true

    return false

}


