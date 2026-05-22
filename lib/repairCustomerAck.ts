import type { SupabaseClient } from '@supabase/supabase-js'

export type RepairCustomerAckResult =
    | { ok: true; requestNo: number; alreadyDone: boolean }
    | { ok: false; message: string }

/**
 * 顧客が LINE postback で完了内容を承諾。
 * status: completed → closed、customer_acknowledged_at を記録。
 */
export async function acknowledgeRepairByCustomer(
    sb: SupabaseClient,
    lineUserId: string,
    repairRequestId: string,
): Promise<RepairCustomerAckResult> {
    const uid = String(lineUserId || '').trim()
    const rid = String(repairRequestId || '').trim()
    if (!uid || !rid) {
        return { ok: false, message: '不正なリクエストです' }
    }

    const { data: repair, error } = await sb
        .from('repair_requests')
        .select('id, request_no, status, line_user_id, customer_acknowledged_at, received_via')
        .eq('id', rid)
        .single()

    if (error || !repair) {
        return { ok: false, message: '修理案件が見つかりません' }
    }

    if (String(repair.line_user_id || '') !== uid) {
        return { ok: false, message: 'この案件のご依頼者のみ承諾できます' }
    }

    if (repair.customer_acknowledged_at) {
        return { ok: true, requestNo: repair.request_no, alreadyDone: true }
    }

    if (repair.status !== 'completed' && repair.status !== 'billed') {
        return {
            ok: false,
            message: 'この案件はまだ完了報告の承諾を受け付けていません',
        }
    }

    const now = new Date().toISOString()
    const oldStatus = repair.status

    const { error: upErr } = await sb
        .from('repair_requests')
        .update({
            customer_acknowledged_at: now,
            status: 'closed',
        })
        .eq('id', rid)

    if (upErr) {
        return { ok: false, message: upErr.message }
    }

    await sb.from('repair_status_history').insert({
        repair_request_id: rid,
        old_status: oldStatus,
        new_status: 'closed',
        comment: 'customer_line_ack',
    })

    return { ok: true, requestNo: repair.request_no, alreadyDone: false }
}
