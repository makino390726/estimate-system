import { isLineWorksConfigured } from '@/lib/lineWorksClient'

/** 担当者向け修理通知チャネル（LINE 公式と LINE WORKS は同時利用しない） */
export type RepairStaffNotifyChannel = 'lineworks' | 'line'

function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}

/**
 * 担当者修理通知のチャネルを1つだけ返す。
 * - REPAIR_STAFF_NOTIFY_CHANNEL=lineworks|line があればそれを優先（併用禁止の明示）
 * - 未指定時: LINE WORKS 必須変数が揃っていれば lineworks、否则 line
 */
export function getRepairStaffNotifyChannel(): RepairStaffNotifyChannel {
    const explicit = trim(process.env.REPAIR_STAFF_NOTIFY_CHANNEL).toLowerCase()
    if (explicit === 'line' || explicit === 'lineworks') {
        return explicit
    }
    return isLineWorksConfigured() ? 'lineworks' : 'line'
}

export function isRepairStaffNotifyLineWorksMode(): boolean {
    return getRepairStaffNotifyChannel() === 'lineworks'
}

export function isRepairStaffNotifyLineOaMode(): boolean {
    return getRepairStaffNotifyChannel() === 'line'
}

export const REPAIR_STAFF_NOTIFY_POLICY_NOTE =
    '担当者向け修理通知は LINE WORKS と LINE 公式のいずれか一方のみ利用します（併用しません）。'

export function repairStaffNotifyChannelLabel(channel: RepairStaffNotifyChannel): string {
    return channel === 'lineworks' ? 'LINE WORKS' : 'LINE 公式アカウント'
}
