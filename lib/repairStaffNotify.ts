import type { SupabaseClient } from '@supabase/supabase-js'
import { sendRepairRequestEmails, type RepairNotifyResult } from '@/lib/repairNotifyEmail'
import {
    getRepairStaffNotifyChannel,
    isRepairStaffNotifyLineWorksMode,
} from '@/lib/repairStaffNotifyChannel'
import {
    sendRepairRequestLineWorksToStaff,
    type RepairLineWorksNotifyResult,
} from '@/lib/repairLineWorksNotify'
import { notifyStaffNewRepair } from '@/lib/lineClient'
import { findStaffLineMappingsForNames } from '@/lib/lineStaffMappingDb'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import {
    resolveRepairNotifyScope,
    resolveRepairNotifyStaffNames,
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
    options?: { staffNameOnly?: string },
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

    const staffNameOnly = trim(options?.staffNameOnly)
    let staffNames = resolveRepairNotifyStaffNames(
        repair,
        (staffRows || []) as RepairNotifyStaffRow[],
        branchId,
        departmentNames,
    )
    if (staffNameOnly) {
        const allStaffNames = (staffRows || []).map((s) => trim(s.name)).filter(Boolean)
        const resolved = resolveStaffName(staffNameOnly, allStaffNames) || staffNameOnly
        staffNames = [resolved]
    }
    if (staffNames.length === 0) {
        return {
            ok: true,
            skipped: true,
            reason: `no staff for branch/departments (${departmentNames.join(' / ')})`,
        }
    }

    let lineTargets: Array<{ staffName: string; lineUserId: string }>
    try {
        lineTargets = await findStaffLineMappingsForNames(sb, staffNames)
    } catch (mapErr) {
        const msg = mapErr instanceof Error ? mapErr.message : String(mapErr)
        return { ok: false, error: msg }
    }

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

export type RepairStaffNotifyOptions = {
    /** 指定時はこの担当者のみ（LINE WORKS / LINE 公式の個別通知） */
    staffNameOnly?: string
}

/**
 * 修理依頼登録時の担当者通知
 * - メール: 常に試行
 * - 担当者チャネル: LINE WORKS または LINE 公式のどちらか一方のみ（併用禁止）
 */
export async function notifyRepairRequestStaff(
    repairRequestId: string,
    options?: RepairStaffNotifyOptions,
): Promise<RepairStaffNotifyResult> {
    const email = await sendRepairRequestEmails(repairRequestId)
    const channel = getRepairStaffNotifyChannel()

    let lineworks: RepairLineWorksNotifyResult = {
        ok: true,
        skipped: true,
        reason: '担当者通知チャネルが LINE 公式モードのため LINE WORKS は使用しません',
    }
    let line: RepairStaffNotifyResult['line'] = {
        ok: true,
        skipped: true,
        reason: '担当者通知チャネルが LINE WORKS モードのため LINE 公式は使用しません',
    }

    if (channel === 'lineworks') {
        lineworks = await sendRepairRequestLineWorksToStaff(repairRequestId, {
            staffNameOnly: options?.staffNameOnly,
        })
    } else {
        line = await sendRepairRequestLineOaToStaff(repairRequestId, {
            staffNameOnly: options?.staffNameOnly,
        })
    }

    const ok = Boolean(
        (email.ok && (email.sent || email.skipped)) ||
        (line.ok && (line.sent || line.skipped)) ||
        (lineworks.ok && (lineworks.sent || lineworks.skipped)),
    )
    return { ok, email, line, lineworks }
}

/** 受付直後の担当者通知（完了まで await すること） */
export async function notifyRepairRequestCreated(repairRequestId: string): Promise<RepairStaffNotifyResult> {
    const result = await notifyRepairRequestStaff(repairRequestId)
    if (!result.email.ok && !result.email.skipped) {
        console.error('repair email notify failed:', result.email.error)
    }
    if (!result.lineworks.ok && !result.lineworks.skipped) {
        console.error('repair LINE WORKS notify failed:', result.lineworks.error)
    } else if (result.lineworks.skipped && isRepairStaffNotifyLineWorksMode()) {
        console.warn('repair LINE WORKS skipped:', result.lineworks.reason)
    }
    if (!result.line.ok && !result.line.skipped) {
        console.error('repair LINE OA notify failed:', result.line.error)
    } else if (result.line.skipped) {
        console.warn('repair LINE OA skipped:', result.line.reason)
    }
    console.log(
        `repair staff notify #${repairRequestId}: email=${result.email.sent ?? 0}, ` +
        `lineworks=${result.lineworks.sent ?? 0}, line=${result.line.sent ?? 0}`,
    )
    return result
}
