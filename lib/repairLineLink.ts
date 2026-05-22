import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeLineUserId } from '@/lib/lineUserId'

export type LinkRepairLineResult =
    | { ok: true; requestNo: number; alreadyLinked: boolean }
    | { ok: false; message: string; status: number }

/** 既存修理案件に顧客の LINE ユーザー ID を紐づける */
export async function linkRepairRequestToLineUser(
    sb: SupabaseClient,
    repairRequestId: string,
    lineUserId: string,
    lineDisplayName?: string | null,
): Promise<LinkRepairLineResult> {
    const rid = String(repairRequestId || '').trim()
    const uid = normalizeLineUserId(lineUserId)
    if (!rid) {
        return { ok: false, message: '案件IDが不正です', status: 400 }
    }
    if (!uid) {
        return {
            ok: false,
            message: 'LINEユーザーIDを取得できませんでした。LINEアプリから開いてください。',
            status: 400,
        }
    }

    const { data: repair, error: fetchErr } = await sb
        .from('repair_requests')
        .select('id, request_no, line_user_id, notes, status')
        .eq('id', rid)
        .maybeSingle()

    if (fetchErr) {
        return { ok: false, message: fetchErr.message, status: 500 }
    }
    if (!repair) {
        return { ok: false, message: '修理案件が見つかりません', status: 404 }
    }

    const existing = normalizeLineUserId(repair.line_user_id)
    if (existing && existing !== uid) {
        return {
            ok: false,
            message: 'この案件は別のLINEアカウントと連携済みです。担当者にお問い合わせください。',
            status: 409,
        }
    }
    if (existing === uid) {
        return { ok: true, requestNo: repair.request_no, alreadyLinked: true }
    }

    const noteSuffix = lineDisplayName?.trim()
        ? `LINE連携 (表示名: ${lineDisplayName.trim()})`
        : 'LINE連携'
    const prevNotes = String(repair.notes || '').trim()
    const mergedNotes = prevNotes ? `${prevNotes}\n${noteSuffix}` : noteSuffix

    const { error: upErr } = await sb
        .from('repair_requests')
        .update({
            line_user_id: uid,
            received_via: 'line',
            notes: mergedNotes,
        })
        .eq('id', rid)

    if (upErr) {
        return { ok: false, message: upErr.message, status: 500 }
    }

    const st = String(repair.status || 'received')
    try {
        await sb.from('repair_status_history').insert({
            repair_request_id: rid,
            old_status: st,
            new_status: st,
            comment: `customer_line_link:${uid}`,
        })
    } catch {
        /* 履歴のみ失敗時も連携は成功扱い */
    }

    return { ok: true, requestNo: repair.request_no, alreadyLinked: false }
}
