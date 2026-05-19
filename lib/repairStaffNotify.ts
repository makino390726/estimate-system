import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sendRepairRequestEmails, type RepairNotifyResult } from '@/lib/repairNotifyEmail'
import { isLineWorksConfigured } from '@/lib/lineWorksClient'
import {
    sendRepairRequestLineWorksToStaff,
    type RepairLineWorksNotifyResult,
} from '@/lib/repairLineWorksNotify'
import { notifyStaffNewRepair } from '@/lib/lineClient'
import {
    resolveRepairNotifyScope,
    staffMatchesRepairBranch,
    type RepairNotifyStaffRow,
} from '@/lib/repairNotifyRecipients'
import { resolveStaffName } from '@/lib/staffNameMatch'

export type RepairStaffNotifyResult = {
    ok: boolean
    email: RepairNotifyResult
    /** LINE 公式アカウント（レガシー） */
    line: {
        ok: boolean
        sent?: number
        recipients?: string[]
        skipped?: boolean
        reason?: string
        error?: string
    }
    /** LINE WORKS（推奨・確認ボタン付き） */
    lineworks: RepairLineWorksNotifyResult
}

function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}

function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    return createClient(url, key)
}

async function logNotify(
    sb: SupabaseClient,
    repairRequestId: string,
    channel: 'email' | 'line',
    recipient: string,
    status: 'sent' | 'failed' | 'skipped',
    errorMessage?: string,
) {
    try {
        await sb.from('repair_notify_logs').insert({
            repair_request_id: repairRequestId,
            channel,
            recipient,
            status,
            error_message: errorMessage || null,
        })
    } catch (e) {
        console.warn('repair_notify_logs insert failed:', e)
    }
}

/** LINE 公式アカウントへプッシュ（line_staff_mappings） */
async function sendRepairRequestLineOaToStaff(
    repairRequestId: string,
): Promise<RepairStaffNotifyResult['line']> {
    const sb = getSupabaseAdmin()
    const { data: repair, error: repairErr } = await sb
        .from('repair_requests')
        .select('*')
        .eq('id', repairRequestId)
        .single()

    if (repairErr || !repair) {
        return { ok: false, error: repairErr?.message || 'Repair request not found' }
    }

    const { branchId, departmentNames } = resolveRepairNotifyScope(repair)

    const { data: staffRows, error: staffErr } = await sb
        .from('staffs')
        .select('name, email, department, branch_id')

    if (staffErr) return { ok: false, error: staffErr.message }

    const assignedStaff = trim(repair.assigned_staff)
    const allStaffNames = (staffRows || []).map((s) => trim(s.name)).filter(Boolean)
    let matchedStaff = (staffRows || []).filter((s) =>
        staffMatchesRepairBranch(s as RepairNotifyStaffRow, branchId, departmentNames),
    )
    if (assignedStaff) {
        const resolved = resolveStaffName(assignedStaff, allStaffNames)
        const byName = (staffRows || []).filter((s) => trim(s.name) === (resolved || assignedStaff))
        matchedStaff = byName.length > 0 ? byName : matchedStaff
    }
    const staffNames = matchedStaff.map((s) => trim(s.name)).filter(Boolean)
    if (staffNames.length === 0) {
        return {
            ok: true,
            skipped: true,
            reason: `no staff for branch/departments (${departmentNames.join(' / ')})`,
        }
    }

    const { data: mappings, error: mapErr } = await sb
        .from('line_staff_mappings')
        .select('staff_name, line_user_id, notify_enabled')
        .in('staff_name', staffNames)
        .eq('notify_enabled', true)

    if (mapErr) return { ok: false, error: mapErr.message }

    const lineTargets = (mappings || [])
        .map((m) => ({ staffName: trim(m.staff_name), lineUserId: trim(m.line_user_id) }))
        .filter((m) => m.staffName && m.lineUserId.startsWith('U'))

    if (lineTargets.length === 0) {
        return {
            ok: true,
            skipped: true,
            reason: '担当者のLINE連携が未登録です',
        }
    }

    const photoCount = Array.isArray(repair.photo_urls) ? repair.photo_urls.length : 0
    let sent = 0
    const recipients: string[] = []

    const linePayload = {
        repairRequestId: repairRequestId,
        requestNo: repair.request_no,
        customerName: trim(repair.customer_name),
        symptom: trim(repair.symptom),
        priority: repair.priority,
        model: repair.model,
        category: repair.category,
        customerAddress: repair.customer_address,
        customerPhone: repair.customer_phone,
        customerMobile: repair.customer_mobile,
        customerRegion: repair.customer_region,
        assignedBranch: repair.assigned_branch,
        assignedStaff: repair.assigned_staff,
        photoCount,
    }

    for (const target of lineTargets) {
        try {
            await notifyStaffNewRepair(target.lineUserId, linePayload)
            sent++
            recipients.push(target.staffName)
            await logNotify(sb, repairRequestId, 'line', target.staffName, 'sent')
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            console.error('repair LINE OA notify failed:', target.staffName, e)
            await logNotify(sb, repairRequestId, 'line', target.staffName, 'failed', msg)
        }
    }

    if (sent === 0) return { ok: false, error: 'all LINE sends failed' }
    return { ok: true, sent, recipients }
}

/**
 * 修理依頼登録時の担当者通知
 * - メール: 常に試行
 * - LINE WORKS: 環境変数設定時（確認ボタン = 既読相当）
 * - LINE OA: WORKS 未設定時のみ
 */
export async function notifyRepairRequestStaff(repairRequestId: string): Promise<RepairStaffNotifyResult> {
    const email = await sendRepairRequestEmails(repairRequestId)

    let lineworks: RepairLineWorksNotifyResult = { ok: true, skipped: true, reason: 'not configured' }
    let line: RepairStaffNotifyResult['line'] = { ok: true, skipped: true, reason: 'not used' }

    if (isLineWorksConfigured()) {
        lineworks = await sendRepairRequestLineWorksToStaff(repairRequestId)
    } else {
        line = await sendRepairRequestLineOaToStaff(repairRequestId)
    }

    const ok = Boolean(
        (email.ok && (email.sent || email.skipped)) ||
        (lineworks.ok && (lineworks.sent || lineworks.skipped)) ||
        (line.ok && (line.sent || line.skipped)),
    )
    return { ok, email, line, lineworks }
}

export function notifyRepairRequestCreated(repairRequestId: string): void {
    void notifyRepairRequestStaff(repairRequestId).then((result) => {
        if (!result.email.ok && !result.email.skipped) {
            console.error('repair email notify failed:', result.email.error)
        }
        if (!result.lineworks.ok && !result.lineworks.skipped) {
            console.error('repair LINE WORKS notify failed:', result.lineworks.error)
        } else if (result.lineworks.skipped && isLineWorksConfigured()) {
            console.warn('repair LINE WORKS skipped:', result.lineworks.reason)
        }
        if (!result.line.ok && !result.line.skipped && !isLineWorksConfigured()) {
            console.error('repair LINE OA notify failed:', result.line.error)
        }
        console.log(
            `repair staff notify #${repairRequestId}: email=${result.email.sent ?? 0}, ` +
            `lineworks=${result.lineworks.sent ?? 0}, line=${result.line.sent ?? 0}`,
        )
    }).catch((e) => {
        console.error('repair staff notify exception:', e)
    })
}
