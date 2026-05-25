import type { SupabaseClient } from '@supabase/supabase-js'

function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}

export type RecordOfficeSalesConfirmResult =
    | {
          ok: true
          requestNo: number
          alreadyConfirmed: boolean
          confirmedAt: string | null
      }
    | { ok: false; message: string }

/** 事務担当: 売上処理前の内容確認を記録 */
export async function recordRepairOfficeSalesConfirmed(
    sb: SupabaseClient,
    repairRequestId: string,
    confirmedBy?: string | null,
): Promise<RecordOfficeSalesConfirmResult> {
    const id = trim(repairRequestId)
    if (!id) return { ok: false, message: 'repair_request_id is required' }

    const { data: repair, error: fetchErr } = await sb
        .from('repair_requests')
        .select('request_no, status, office_sales_confirmed_at')
        .eq('id', id)
        .single()

    if (fetchErr || !repair) {
        return { ok: false, message: fetchErr?.message || '案件が見つかりません' }
    }

    if (repair.status !== 'completed') {
        return {
            ok: false,
            message: `完了報告済みの案件のみ確認できます（現在: ${repair.status}）`,
        }
    }

    if (repair.office_sales_confirmed_at) {
        return {
            ok: true,
            requestNo: repair.request_no,
            alreadyConfirmed: true,
            confirmedAt: repair.office_sales_confirmed_at,
        }
    }

    const now = new Date().toISOString()
    const by = trim(confirmedBy) || null
    const { error: upErr } = await sb
        .from('repair_requests')
        .update({
            office_sales_confirmed_at: now,
            office_sales_confirmed_by: by,
        })
        .eq('id', id)
        .is('office_sales_confirmed_at', null)

    if (upErr) {
        const hint = /office_sales_confirmed/i.test(upErr.message)
            ? '（Supabase で add_repair_office_sales_confirmed.sql を実行してください）'
            : ''
        return { ok: false, message: `${upErr.message}${hint}` }
    }

    return {
        ok: true,
        requestNo: repair.request_no,
        alreadyConfirmed: false,
        confirmedAt: now,
    }
}
