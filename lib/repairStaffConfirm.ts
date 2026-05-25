import type { SupabaseClient } from '@supabase/supabase-js'
import { confirmRepairLineWorksFromWeb } from '@/lib/repairLineWorksNotify'
import { persistRepairStatusTransition } from '@/lib/repairStatusUpdate'

export type RecordRepairStaffConfirmResult =
    | {
          ok: true
          requestNo: number
          statusUpdated: boolean
          alreadyConfirmed: boolean
          receivedVia: string
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
        receivedVia: String(repair.received_via || ''),
    }
}

export type RecordRepairRepairingResult =
    | {
          ok: true
          requestNo: number
          statusUpdated: boolean
          alreadyRepairing: boolean
          receivedVia: string
      }
    | { ok: false; message: string }

const TERMINAL_FOR_REPAIRING = new Set(['completed', 'billed', 'closed'])

/** 現場画面の「修理中」: ステータスを repairing にし、LINE 顧客へ通知 */
export async function recordRepairRepairing(
    sb: SupabaseClient,
    repairRequestId: string,
): Promise<RecordRepairRepairingResult> {
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
    if (oldStatus === 'repairing') {
        return {
            ok: true,
            requestNo: repair.request_no,
            statusUpdated: false,
            alreadyRepairing: true,
            receivedVia: String(repair.received_via || ''),
        }
    }
    if (TERMINAL_FOR_REPAIRING.has(oldStatus)) {
        return { ok: false, message: `すでに終了した案件です（${oldStatus}）` }
    }

    await persistRepairStatusTransition(
        sb,
        rid,
        oldStatus,
        'repairing',
        String(repair.received_via || ''),
    )

    const now = new Date().toISOString()
    await sb
        .from('repair_lineworks_notifications')
        .update({
            status: 'acknowledged',
            acknowledged_at: now,
        })
        .eq('repair_request_id', rid)
        .eq('status', 'pending')

    return {
        ok: true,
        requestNo: repair.request_no,
        statusUpdated: true,
        alreadyRepairing: false,
        receivedVia: String(repair.received_via || ''),
    }
}
