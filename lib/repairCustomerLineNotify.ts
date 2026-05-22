import type { SupabaseClient } from '@supabase/supabase-js'
import { pushMessage } from '@/lib/lineClient'
import { pushRepairCompletionToCustomer } from '@/lib/repairLineCustomerNotify'

function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}

/** LINE 顧客へステータス通知（完了時は Flex 報告、それ以外は短文） */
export async function notifyRepairCustomerLineStatus(
    sb: SupabaseClient,
    repairId: string,
): Promise<void> {
    const { data: repair, error } = await sb.from('repair_requests').select('*').eq('id', repairId).single()
    if (error || !repair) return
    if (trim(repair.received_via) !== 'line') return
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
        billed: '請求済み',
        closed: '対応完了',
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
