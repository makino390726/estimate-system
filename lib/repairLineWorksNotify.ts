import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { formatRepairCategoryDisplay } from '@/lib/customerRegisterSheetTypes'
import {
    buildRepairAckPostbackData,
    isLineWorksConfigured,
    sendLineWorksUserMessage,
} from '@/lib/lineWorksClient'
import {
    resolveRepairNotifyScope,
    staffMatchesRepairBranch,
    type RepairNotifyStaffRow,
} from '@/lib/repairNotifyRecipients'

export type RepairLineWorksNotifyResult = {
    ok: boolean
    sent?: number
    recipients?: string[]
    skipped?: boolean
    reason?: string
    error?: string
}

function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}

function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    return createClient(url, key)
}

function getBaseUrl(): string {
    const isDev = process.env.NODE_ENV !== 'production'
    return (
        (isDev ? trim(process.env.LOCAL_BASE_URL) : trim(process.env.PROD_BASE_URL)) ||
        (isDev ? 'http://localhost:3000' : 'https://estimate-system-ten.vercel.app')
    )
}

const PRIORITY_LABELS: Record<string, string> = {
    urgent: '緊急',
    high: '高',
    normal: '通常',
    low: '低',
}

async function logNotify(
    sb: SupabaseClient,
    repairRequestId: string,
    recipient: string,
    status: 'sent' | 'failed' | 'skipped',
    errorMessage?: string,
) {
    try {
        await sb.from('repair_notify_logs').insert({
            repair_request_id: repairRequestId,
            channel: 'lineworks',
            recipient,
            status,
            error_message: errorMessage || null,
        })
    } catch (e) {
        console.warn('repair_notify_logs (lineworks):', e)
    }
}

function buildButtonTemplateMessage(params: {
    requestNo: number
    customerName: string
    branchLabel: string
    symptom: string
    model?: string | null
    category?: string | null
    priority: string
    detailUrl: string
    notificationId: string
}) {
    const lines = [
        `【新規修理受付 #${params.requestNo}】`,
        `管轄: ${params.branchLabel}`,
        `優先度: ${PRIORITY_LABELS[params.priority] || params.priority}`,
        `顧客: ${params.customerName}`,
        params.model ? `型式: ${params.model}` : null,
        params.category ? `分野: ${formatRepairCategoryDisplay(params.category)}` : null,
        `症状: ${params.symptom}`,
        '',
        '内容を確認したら「確認しました」を押してください。',
    ].filter(Boolean)

    return {
        type: 'button_template',
        contentText: lines.join('\n'),
        actions: [
            {
                type: 'postback',
                label: '確認しました',
                postback: buildRepairAckPostbackData(params.notificationId),
            },
            {
                type: 'uri',
                label: '案件を開く',
                uri: params.detailUrl,
            },
        ],
    }
}

/** 管轄担当者へ LINE WORKS 通知（確認ボタン付き） */
export async function sendRepairRequestLineWorksToStaff(
    repairRequestId: string,
): Promise<RepairLineWorksNotifyResult> {
    if (!isLineWorksConfigured()) {
        return { ok: true, skipped: true, reason: 'LINE WORKS 未設定' }
    }

    const sb = getSupabaseAdmin()
    const { data: repair, error: repairErr } = await sb
        .from('repair_requests')
        .select('*')
        .eq('id', repairRequestId)
        .single()

    if (repairErr || !repair) {
        return { ok: false, error: repairErr?.message || 'Repair request not found' }
    }

    const { branchId, departmentNames, branchLabel } = resolveRepairNotifyScope(repair)

    const { data: staffRows, error: staffErr } = await sb
        .from('staffs')
        .select('name, email, department, branch_id')

    if (staffErr) return { ok: false, error: staffErr.message }

    const matchedStaff = (staffRows || []).filter((s) =>
        staffMatchesRepairBranch(s as RepairNotifyStaffRow, branchId, departmentNames),
    )
    const staffNames = matchedStaff.map((s) => trim(s.name)).filter(Boolean)
    if (staffNames.length === 0) {
        return {
            ok: true,
            skipped: true,
            reason: `no staff for (${departmentNames.join(' / ')})`,
        }
    }

    const { data: mappings, error: mapErr } = await sb
        .from('lineworks_staff_mappings')
        .select('staff_name, lineworks_user_id, notify_enabled')
        .in('staff_name', staffNames)
        .eq('notify_enabled', true)

    if (mapErr) return { ok: false, error: mapErr.message }

    const targets = (mappings || [])
        .map((m) => ({
            staffName: trim(m.staff_name),
            lineWorksUserId: trim(m.lineworks_user_id),
        }))
        .filter((m) => m.staffName && m.lineWorksUserId)

    if (targets.length === 0) {
        await logNotify(sb, repairRequestId, '(none)', 'skipped', 'LINE WORKS mapping missing')
        return {
            ok: true,
            skipped: true,
            reason: '担当者の LINE WORKS 連携が未登録です（lineworks-staff-notify で設定）',
        }
    }

    const detailUrl = `${getBaseUrl()}/repair-requests`
    let sent = 0
    const recipients: string[] = []

    for (const target of targets) {
        const { data: row, error: insErr } = await sb
            .from('repair_lineworks_notifications')
            .upsert(
                {
                    repair_request_id: repairRequestId,
                    staff_name: target.staffName,
                    lineworks_user_id: target.lineWorksUserId,
                    status: 'pending',
                    sent_at: null,
                    acknowledged_at: null,
                    error_message: null,
                },
                { onConflict: 'repair_request_id,staff_name' },
            )
            .select('id')
            .single()

        if (insErr || !row?.id) {
            console.error('repair_lineworks_notifications upsert:', insErr)
            await logNotify(sb, repairRequestId, target.staffName, 'failed', insErr?.message)
            continue
        }

        try {
            const content = buildButtonTemplateMessage({
                requestNo: repair.request_no,
                customerName: repair.customer_name,
                branchLabel,
                symptom: repair.symptom,
                model: repair.model,
                category: repair.category,
                priority: repair.priority,
                detailUrl,
                notificationId: row.id,
            })
            await sendLineWorksUserMessage(target.lineWorksUserId, content)
            await sb
                .from('repair_lineworks_notifications')
                .update({ status: 'pending', sent_at: new Date().toISOString(), error_message: null })
                .eq('id', row.id)
            sent++
            recipients.push(target.staffName)
            await logNotify(sb, repairRequestId, target.staffName, 'sent')
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            await sb
                .from('repair_lineworks_notifications')
                .update({ status: 'failed', error_message: msg })
                .eq('id', row.id)
            await logNotify(sb, repairRequestId, target.staffName, 'failed', msg)
            console.error('LINE WORKS notify failed:', target.staffName, e)
        }
    }

    if (sent === 0) {
        return { ok: false, error: 'all LINE WORKS sends failed' }
    }
    return { ok: true, sent, recipients }
}

/** postback「確認しました」 */
export async function acknowledgeRepairLineWorksNotification(
    notificationId: string,
    lineWorksUserId: string,
): Promise<{ ok: boolean; requestNo?: number; error?: string }> {
    const sb = getSupabaseAdmin()
    const { data: row, error } = await sb
        .from('repair_lineworks_notifications')
        .select('id, repair_request_id, staff_name, status, lineworks_user_id')
        .eq('id', notificationId)
        .single()

    if (error || !row) {
        return { ok: false, error: '通知が見つかりません' }
    }

    if (row.status === 'acknowledged') {
        const { data: repair } = await sb
            .from('repair_requests')
            .select('request_no')
            .eq('id', row.repair_request_id)
            .single()
        return { ok: true, requestNo: repair?.request_no }
    }

    const { error: upErr } = await sb
        .from('repair_lineworks_notifications')
        .update({
            status: 'acknowledged',
            acknowledged_at: new Date().toISOString(),
            lineworks_user_id: lineWorksUserId || row.lineworks_user_id,
        })
        .eq('id', notificationId)

    if (upErr) return { ok: false, error: upErr.message }

    const { data: repair } = await sb
        .from('repair_requests')
        .select('request_no')
        .eq('id', row.repair_request_id)
        .single()

    return { ok: true, requestNo: repair?.request_no }
}

export async function fetchRepairLineWorksAckSummary(repairRequestId: string) {
    const sb = getSupabaseAdmin()
    const { data } = await sb
        .from('repair_lineworks_notifications')
        .select('staff_name, status, sent_at, acknowledged_at')
        .eq('repair_request_id', repairRequestId)
        .order('staff_name')

    return data || []
}
