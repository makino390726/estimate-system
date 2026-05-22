import type { SupabaseClient } from '@supabase/supabase-js'
import { pushMessage } from '@/lib/lineClient'
import { isValidLineUserId } from '@/lib/lineUserId'
import { pushRepairCompletionToCustomer } from '@/lib/repairLineCustomerNotify'

function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}

export type RepairCustomerLineNotifyResult =
    | { ok: true }
    | { ok: false; skipped: string }
    | { ok: false; error: string }

function canNotifyCustomerLine(repair: {
    received_via?: string | null
    line_user_id?: string | null
}): boolean {
    return isValidLineUserId(repair.line_user_id)
}

/** 修理完了時に顧客へ Flex 報告（現場「完了」ボタン用） */
export async function notifyRepairCustomerOnCompleted(
    sb: SupabaseClient,
    repairId: string,
): Promise<RepairCustomerLineNotifyResult> {
    const { data: repair, error } = await sb.from('repair_requests').select('*').eq('id', repairId).single()
    if (error || !repair) {
        return { ok: false, skipped: '案件が見つかりません' }
    }
    if (repair.status !== 'completed') {
        return { ok: false, skipped: `完了報告送信前のステータスです（${repair.status}）` }
    }
    const lineUserId = trim(repair.line_user_id)
    if (!isValidLineUserId(lineUserId)) {
        return {
            ok: false,
            skipped: '顧客のLINE IDが未登録です（LIFF受付またはLINE連携が必要）',
        }
    }

    const { data: parts } = await sb
        .from('repair_parts')
        .select('part_name, part_code, quantity')
        .eq('repair_request_id', repairId)
        .order('created_at')

    try {
        await pushRepairCompletionToCustomer(lineUserId, {
            repairRequestId: repairId,
            requestNo: repair.request_no,
            visitCompletedDate: repair.visit_completed_date,
            treatmentDetails: repair.treatment_details,
            rootCause: repair.root_cause,
            durationMinutes: repair.repair_duration_minutes,
            visitFee: repair.visit_fee,
            laborCost: repair.labor_cost,
            parts: parts || [],
            alreadyAcknowledged: Boolean(repair.customer_acknowledged_at),
        })
        return { ok: true }
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('notifyRepairCustomerOnCompleted:', repairId, e)
        return { ok: false, error: message }
    }
}

/** LINE 顧客へステータス通知（完了時は Flex 報告、それ以外は短文） */
export async function notifyRepairCustomerLineStatus(
    sb: SupabaseClient,
    repairId: string,
): Promise<void> {
    const { data: repair, error } = await sb.from('repair_requests').select('*').eq('id', repairId).single()
    if (error || !repair) return
    if (!canNotifyCustomerLine(repair)) return
    const lineUserId = trim(repair.line_user_id)
    if (!lineUserId) return

    if (repair.status === 'completed') {
        const { data: parts } = await sb
            .from('repair_parts')
            .select('part_name, part_code, quantity')
            .eq('repair_request_id', repairId)
            .order('created_at')

        await pushRepairCompletionToCustomer(lineUserId, {
            repairRequestId: repairId,
            requestNo: repair.request_no,
            visitCompletedDate: repair.visit_completed_date,
            treatmentDetails: repair.treatment_details,
            rootCause: repair.root_cause,
            durationMinutes: repair.repair_duration_minutes,
            visitFee: repair.visit_fee,
            laborCost: repair.labor_cost,
            parts: parts || [],
            alreadyAcknowledged: Boolean(repair.customer_acknowledged_at),
        })
        return
    }

    const statusLabels: Record<string, string> = {
        received: '受付完了',
        staff_confirmed: '担当者確認済み',
        confirming: '確認中',
        phone_done: '電話対応済み',
        visit_scheduled: '出張訪問予定',
        parts_waiting: '部品手配中',
        repairing: '修理作業中',
        completed: '完了報告済（承諾待ち）',
        billed: '請求済み',
        closed: '完了',
    }

    const statusText = statusLabels[repair.status] || repair.status
    const text = [
        '【修理進捗のお知らせ】',
        `受付番号: #${repair.request_no}`,
        `ステータス: ${statusText}`,
        '',
        repair.status === 'visit_scheduled' && repair.visit_scheduled_date
            ? `出張予定日: ${repair.visit_scheduled_date}`
            : null,
    ]
        .filter(Boolean)
        .join('\n')

    await pushMessage(lineUserId, text)
}
