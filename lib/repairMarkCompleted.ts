import type { SupabaseClient } from '@supabase/supabase-js'
import {
    notifyRepairCustomerOnCompleted,
    type RepairCustomerLineNotifyResult,
} from '@/lib/repairCustomerLineNotify'

export type ApplyMarkCompletedResult = {
    statusApplied: boolean
    previousStatus: string
    newStatus: 'completed'
    lineCustomerNotify: RepairCustomerLineNotifyResult
}

/** 完了報告: ステータスを completed にし、履歴・顧客LINE通知まで行う（他フィールドより先に実行） */
export async function applyRepairMarkCompleted(
    sb: SupabaseClient,
    repairId: string,
    baseline: string,
    visitCompletedDate?: string | null,
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
        .update({ status: 'completed', visit_completed_date: visitDate })
        .eq('id', repairId)
        .select('status')
        .single()

    if (upErr) {
        throw new Error(
            `ステータスを完了報告済にできません: ${upErr.message}（Supabaseで apply_repair_prerequisites.sql の実行を確認してください）`,
        )
    }

    if (updated?.status !== 'completed') {
        throw new Error(
            `ステータス更新が反映されませんでした（DB上: ${updated?.status ?? '不明'}）。SUPABASE_SERVICE_ROLE_KEY の設定を確認してください`,
        )
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

    const lineCustomerNotify = await notifyRepairCustomerOnCompleted(sb, repairId)
    return {
        statusApplied: true,
        previousStatus,
        newStatus: 'completed',
        lineCustomerNotify,
    }
}
