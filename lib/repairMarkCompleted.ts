import type { SupabaseClient } from '@supabase/supabase-js'
import {
    notifyRepairCustomerOnCompleted,
    type RepairCustomerLineNotifyResult,
} from '@/lib/repairCustomerLineNotify'
import {
    sendRepairCompletionReportLineWorksToOffice,
    sendRepairCompletionReportLineWorksToStaff,
    type RepairLineWorksNotifyResult,
} from '@/lib/repairLineWorksNotify'

export type ApplyMarkCompletedResult = {
    statusApplied: boolean
    previousStatus: string
    newStatus: 'completed'
    lineCustomerNotify?: RepairCustomerLineNotifyResult
    lineWorksNotify?: RepairLineWorksNotifyResult
    lineWorksOfficeNotify?: RepairLineWorksNotifyResult
}

export type RepairMarkCompletedNotifyResult = {
    lineCustomerNotify: RepairCustomerLineNotifyResult
    lineWorksNotify: RepairLineWorksNotifyResult
    lineWorksOfficeNotify: RepairLineWorksNotifyResult
}

/** 完了報告後の各種通知（出張費・部品など DB 保存後に呼ぶ） */
export async function sendRepairMarkCompletedNotifications(
    sb: SupabaseClient,
    repairId: string,
): Promise<RepairMarkCompletedNotifyResult> {
    const lineCustomerNotify = await notifyRepairCustomerOnCompleted(sb, repairId)
    const lineWorksNotify = await sendRepairCompletionReportLineWorksToStaff(repairId)
    const lineWorksOfficeNotify = await sendRepairCompletionReportLineWorksToOffice(repairId)
    return { lineCustomerNotify, lineWorksNotify, lineWorksOfficeNotify }
}

export type ApplyMarkCompletedOptions = {
    /** true のときはステータス更新のみ（通知は sendRepairMarkCompletedNotifications で後から） */
    deferNotifications?: boolean
}

/** 完了報告: ステータスを completed にし、履歴を記録（通知は defer 可能） */
export async function applyRepairMarkCompleted(
    sb: SupabaseClient,
    repairId: string,
    baseline: string,
    visitCompletedDate?: string | null,
    options?: ApplyMarkCompletedOptions,
): Promise<ApplyMarkCompletedResult> {
    const { data: existing, error: fetchErr } = await sb
        .from('repair_requests')
        .select('status')
        .eq('id', repairId)
        .single()

    if (fetchErr || !existing) {
        throw new Error(fetchErr?.message || '案件が見つかりません')
    }

    const previousStatus = String(existing.status || baseline || 'received')
    const visitDate =
        typeof visitCompletedDate === 'string' && visitCompletedDate.trim()
            ? visitCompletedDate.trim()
            : new Date().toISOString().split('T')[0]

    const { data: updated, error: upErr } = await sb
        .from('repair_requests')
        .update({ status: 'completed' })
        .eq('id', repairId)
        .select('status')
        .single()

    if (upErr) {
        const hint = /check|constraint|violates/i.test(upErr.message)
            ? '（Supabase SQL Editor で apply_repair_prerequisites.sql を実行）'
            : ''
        throw new Error(`ステータスを完了報告済にできません: ${upErr.message}${hint}`)
    }

    if (updated?.status !== 'completed') {
        throw new Error(
            `ステータス更新が反映されませんでした（DB上: ${updated?.status ?? '不明'}）。SUPABASE_SERVICE_ROLE_KEY の設定を確認してください`,
        )
    }

    const { error: dateErr } = await sb
        .from('repair_requests')
        .update({ visit_completed_date: visitDate })
        .eq('id', repairId)
    if (dateErr) {
        console.warn('visit_completed_date update:', repairId, dateErr.message)
    }

    if (previousStatus !== 'completed') {
        const { error: histErr } = await sb.from('repair_status_history').insert({
            repair_request_id: repairId,
            old_status: baseline || previousStatus,
            new_status: 'completed',
        })
        if (histErr) {
            console.warn('repair_status_history insert:', histErr.message)
        }
    }

    if (options?.deferNotifications) {
        return {
            statusApplied: true,
            previousStatus,
            newStatus: 'completed',
        }
    }

    const notifications = await sendRepairMarkCompletedNotifications(sb, repairId)
    return {
        statusApplied: true,
        previousStatus,
        newStatus: 'completed',
        ...notifications,
    }
}
