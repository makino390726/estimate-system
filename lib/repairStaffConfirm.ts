import type { SupabaseClient } from '@supabase/supabase-js'
import { confirmRepairLineWorksFromWeb } from '@/lib/repairLineWorksNotify'
import { persistRepairStatusTransition } from '@/lib/repairStatusUpdate'

export type RecordRepairStaffConfirmResult =
    | {
          ok: true
          requestNo: number
          statusUpdated: boolean
          alreadyConfirmed: boolean
      }
    | { ok: false; message: string }

/** 現場画面の「担当者確認」: 受付→担当者確認、LINE WORKS 通知を確認済みにする */
export async function recordRepairStaffConfirmed(
    sb: SupabaseClient,
    repairRequestId: string,
): Promise<RecordRepairStaffConfirmResult> {
    const rid = String(repairRequestId || '').trim()
    if (!rid) {
        return { ok: false, message: '案件IDが不正です' }
    }

    const { data: repair, error: fetchErr } = await sb
        .from('repair_requests')
        .select('request_no, status, received_via')
        .eq('id', rid)
        .single()

    if (fetchErr || !repair) {
        return { ok: false, message: fetchErr?.message || '案件が見つかりません' }
    }

    const oldStatus = String(repair.status || '')
    const statusUpdated = oldStatus === 'received'

    if (statusUpdated) {
        await persistRepairStatusTransition(
            sb,
            rid,
            'received',
            'staff_confirmed',
            String(repair.received_via || ''),
        )
    }

    const now = new Date().toISOString()
    await sb
        .from('repair_lineworks_notifications')
        .update({
            status: 'acknowledged',
            acknowledged_at: now,
        })
        .eq('repair_request_id', rid)
        .eq('status', 'pending')

    if (statusUpdated) {
        void confirmRepairLineWorksFromWeb(rid).catch((e) =>
            console.warn('repair staff confirm lineworks reply:', e),
        )
    }

    return {
        ok: true,
        requestNo: repair.request_no,
        statusUpdated,
        alreadyConfirmed: !statusUpdated,
    }
}
