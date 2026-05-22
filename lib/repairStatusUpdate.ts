import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyRepairCustomerLineStatus } from '@/lib/repairCustomerLineNotify'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}

/**
 * ステータス変更を DB に反映し、LINE 顧客通知・担当者確認の LINE WORKS を起動。
 */
export async function persistRepairStatusTransition(
    sb: SupabaseClient,
    repairId: string,
    oldStatus: string,
    newStatus: string,
    receivedVia: string,
    options?: { skipCustomerLineNotify?: boolean },
): Promise<void> {
    if (oldStatus === newStatus) return

    const { error } = await sb.from('repair_requests').update({ status: newStatus }).eq('id', repairId)
    if (error) throw error

    const { error: histErr } = await sb.from('repair_status_history').insert({
        repair_request_id: repairId,
        old_status: oldStatus,
        new_status: newStatus,
    })
    if (histErr) throw histErr

    if (!options?.skipCustomerLineNotify && trim(receivedVia) === 'line' && newStatus !== 'completed') {
        await notifyRepairCustomerLineStatus(sb, repairId).catch((e) =>
            console.warn('line customer notify:', e),
        )
    }

    if (newStatus === 'staff_confirmed') {
        const base =
            trim(process.env.PROD_BASE_URL) ||
            trim(process.env.NEXT_PUBLIC_APP_BASE_URL) ||
            'https://estimate-system-ten.vercel.app'
        await fetch(`${base}/api/lineworks/confirm-from-web`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repair_request_id: repairId }),
        }).catch((e) => console.warn('lineworks confirm-from-web:', e))
    }
}

/** API ルート用 */
export function getRepairAdminSupabase() {
    return getSupabaseAdmin()
}
