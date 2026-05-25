import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatRepairCategoryDisplay } from '@/lib/customerRegisterSheetTypes'
import { findLineWorksStaffMappingsForNames } from '@/lib/lineworksStaffMappingDb'
import {
    buildRepairAckPostbackData,
    buildRepairRepairingPostbackData,
    isLineWorksConfigured,
    sendLineWorksUserMessage,
} from '@/lib/lineWorksClient'
import { notifyRepairCustomerLineStatus } from '@/lib/repairCustomerLineNotify'
import { persistRepairStatusTransition } from '@/lib/repairStatusUpdate'
import {
    resolveRepairNotifyScope,
    resolveRepairNotifyStaffNames,
    type RepairNotifyStaffRow,
} from '@/lib/repairNotifyRecipients'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveStaffName } from '@/lib/staffNameMatch'

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

/** 現場スマホ向け修理対応画面 URL（LINE WORKS 通知のリンク先） */
export function getRepairCaseDetailUrl(repairRequestId: string): string {
    const id = trim(repairRequestId)
    return `${getBaseUrl()}/repair-mobile/${encodeURIComponent(id)}`
}

/** 完了報告送信時（担当者向け） */
function buildCompletionReportLineWorksMessage(params: {
    requestNo: number
    customerName: string
    caseUrl: string
}) {
    return {
        type: 'button_template',
        contentText: [
            `修理依頼案件 #${params.requestNo} の完了報告書を送信しました。`,
            `顧客: ${params.customerName}`,
            '',
            '下の「案件を開く」から内容を確認できます。',
        ].join('\n'),
        actions: [
            {
                type: 'uri',
                label: '案件を開く',
                uri: params.caseUrl,
            },
        ],
    }
}

/** 新規受付通知（担当者確認・修理中ボタン + 案件リンク） */
function buildCaseLinkMessage(params: {
    notificationId: string
    requestNo: number
    customerName: string
    branchLabel: string
    symptom: string
    model?: string | null
    category?: string | null
    priority: string
    caseUrl: string
    customerPhone?: string | null
    customerMobile?: string | null
}) {
    const phone = trim(params.customerPhone) || trim(params.customerMobile)
    const lines = [
        `【新規修理受付 #${params.requestNo}】`,
        `管轄: ${params.branchLabel}`,
        `優先度: ${PRIORITY_LABELS[params.priority] || params.priority}`,
        `顧客: ${params.customerName}`,
        phone ? `緊急連絡先: ${phone}` : null,
        params.model ? `型式: ${params.model}` : null,
        params.category ? `分野: ${formatRepairCategoryDisplay(params.category)}` : null,
        `症状: ${params.symptom}`,
        '',
        '「担当者確認」または「修理中」をタップすると進捗が記録され、',
        'LINE受付のお客様へステータスが通知されます。',
    ].filter(Boolean)

    return {
        type: 'button_template',
        contentText: lines.join('\n'),
        actions: [
            {
                type: 'message',
                label: '担当者確認',
                text: `担当者確認 #${params.requestNo}`,
                postback: buildRepairAckPostbackData(params.notificationId),
            },
            {
                type: 'message',
                label: '修理中',
                text: `修理中 #${params.requestNo}`,
                postback: buildRepairRepairingPostbackData(params.notificationId),
            },
            {
                type: 'uri',
                label: '案件を開く',
                uri: params.caseUrl,
            },
        ],
    }
}

export type LineWorksStaffNotifyOptions = {
    /** 指定時はこの担当者のみ通知 */
    staffNameOnly?: string
}

/** 管轄担当者へ LINE WORKS 通知（案件画面リンク） */
export async function sendRepairRequestLineWorksToStaff(
    repairRequestId: string,
    options?: LineWorksStaffNotifyOptions,
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
            reason: `no staff for (${departmentNames.join(' / ')})`,
        }
    }

    let targets: Array<{ staffName: string; lineWorksUserId: string }>
    try {
        targets = await findLineWorksStaffMappingsForNames(sb, staffNames)
    } catch (mapErr) {
        const msg = mapErr instanceof Error ? mapErr.message : String(mapErr)
        return { ok: false, error: msg }
    }

    if (targets.length === 0) {
        await logNotify(sb, repairRequestId, '(none)', 'skipped', 'LINE WORKS mapping missing')
        return {
            ok: true,
            skipped: true,
            reason: `担当者の LINE WORKS 連携が未登録です（対象: ${staffNames.join(' / ')}）。/lineworks-staff-notify で登録してください`,
        }
    }

    const caseUrl = getRepairCaseDetailUrl(repairRequestId)
    let sent = 0
    const recipients: string[] = []
    let lastError: string | null = null

    for (const target of targets) {
        let notificationId = randomUUID()
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

        if (!insErr && row?.id) {
            notificationId = row.id
        } else if (insErr) {
            console.warn('repair_lineworks_notifications upsert:', insErr.message)
        }

        try {
            const content = buildCaseLinkMessage({
                notificationId,
                requestNo: repair.request_no,
                customerName: repair.customer_name,
                branchLabel,
                symptom: repair.symptom,
                model: repair.model,
                category: repair.category,
                priority: repair.priority,
                caseUrl,
                customerPhone: repair.customer_phone,
                customerMobile: repair.customer_mobile,
            })
            await sendLineWorksUserMessage(target.lineWorksUserId, content)
            if (row?.id) {
                await sb
                    .from('repair_lineworks_notifications')
                    .update({ status: 'pending', sent_at: new Date().toISOString(), error_message: null })
                    .eq('id', row.id)
            }
            sent++
            recipients.push(target.staffName)
            await logNotify(sb, repairRequestId, target.staffName, 'sent')
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            lastError = `${target.staffName}: ${msg}`
            if (row?.id) {
                await sb
                    .from('repair_lineworks_notifications')
                    .update({ status: 'failed', error_message: msg })
                    .eq('id', row.id)
            }
            await logNotify(sb, repairRequestId, target.staffName, 'failed', msg)
            console.error('LINE WORKS notify failed:', target.staffName, e)
        }
    }

    if (sent === 0) {
        const summary = `targets=${targets.length}, sent=0`
        return {
            ok: false,
            error: lastError || 'all LINE WORKS sends failed',
            reason: lastError ? `${summary} — ${lastError}` : summary,
        }
    }
    return { ok: true, sent, recipients }
}

/** 完了報告送信時: 管轄担当者へ LINE WORKS（新規受付通知とは別文面） */
export async function sendRepairCompletionReportLineWorksToStaff(
    repairRequestId: string,
    options?: LineWorksStaffNotifyOptions,
): Promise<RepairLineWorksNotifyResult> {
    if (!isLineWorksConfigured()) {
        return { ok: true, skipped: true, reason: 'LINE WORKS 未設定' }
    }

    const sb = getSupabaseAdmin()
    const { data: repair, error: repairErr } = await sb
        .from('repair_requests')
        .select('request_no, customer_name, assigned_branch, assigned_staff, status')
        .eq('id', repairRequestId)
        .single()

    if (repairErr || !repair) {
        return { ok: false, error: repairErr?.message || 'Repair request not found' }
    }

    if (repair.status !== 'completed') {
        return { ok: true, skipped: true, reason: `ステータスが completed ではありません（${repair.status}）` }
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
            reason: `no staff for (${departmentNames.join(' / ')})`,
        }
    }

    let targets: Array<{ staffName: string; lineWorksUserId: string }>
    try {
        targets = await findLineWorksStaffMappingsForNames(sb, staffNames)
    } catch (mapErr) {
        const msg = mapErr instanceof Error ? mapErr.message : String(mapErr)
        return { ok: false, error: msg }
    }

    if (targets.length === 0) {
        await logNotify(sb, repairRequestId, '(none)', 'skipped', 'LINE WORKS mapping missing (completion)')
        return {
            ok: true,
            skipped: true,
            reason: `担当者の LINE WORKS 連携が未登録です（対象: ${staffNames.join(' / ')}）`,
        }
    }

    const caseUrl = getRepairCaseDetailUrl(repairRequestId)
    const content = buildCompletionReportLineWorksMessage({
        requestNo: repair.request_no,
        customerName: repair.customer_name,
        caseUrl,
    })

    let sent = 0
    const recipients: string[] = []
    let lastError: string | null = null

    for (const target of targets) {
        try {
            await sendLineWorksUserMessage(target.lineWorksUserId, content)
            sent++
            recipients.push(target.staffName)
            await logNotify(sb, repairRequestId, `${target.staffName} (completion)`, 'sent')
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            lastError = `${target.staffName}: ${msg}`
            await logNotify(sb, repairRequestId, `${target.staffName} (completion)`, 'failed', msg)
            console.error('LINE WORKS completion notify failed:', target.staffName, e)
        }
    }

    if (sent === 0) {
        return { ok: false, error: lastError || 'all LINE WORKS completion sends failed' }
    }
    return { ok: true, sent, recipients }
}

/** 受付 → 担当者確認（LINE WORKS「確認しました」） */
export async function upgradeRepairStatusToStaffConfirmed(
    sb: SupabaseClient,
    repairRequestId: string,
): Promise<{ updated: boolean; error?: string }> {
    const { data: repair, error: fetchErr } = await sb
        .from('repair_requests')
        .select('status')
        .eq('id', repairRequestId)
        .single()

    if (fetchErr || !repair) {
        return { updated: false, error: fetchErr?.message || '案件が見つかりません' }
    }
    if (repair.status !== 'received') {
        return { updated: false }
    }

    const { error: statusErr } = await sb
        .from('repair_requests')
        .update({ status: 'staff_confirmed' })
        .eq('id', repairRequestId)
        .eq('status', 'received')

    if (statusErr) {
        const hint = /check|constraint|violates/i.test(statusErr.message)
            ? '（Supabase で add_repair_status_staff_confirmed.sql の実行が必要です）'
            : ''
        return { updated: false, error: `${statusErr.message}${hint}` }
    }
    return { updated: true }
}

const LINEWORKS_ACK_TEXTS = new Set([
    '確認しました',
    '確認済み',
    '確認',
    '了解',
    '承知しました',
    '担当者確認',
])

const LINEWORKS_STAFF_CONFIRM_BUTTON_RE = /^担当者確認(?:\s*#(\d+))?$/
const LINEWORKS_REPAIRING_BUTTON_RE = /^修理中(?:\s*#(\d+))?$/

/** 未確認の通知をユーザーから特定（ボタン以外のテキスト送信フォールバック用） */
export async function findPendingLineWorksNotificationIdForUser(
    lineWorksUserId: string,
): Promise<string | null> {
    const uid = trim(lineWorksUserId)
    if (!uid) return null

    const sb = getSupabaseAdmin()

    const { data: direct } = await sb
        .from('repair_lineworks_notifications')
        .select('id')
        .eq('status', 'pending')
        .eq('lineworks_user_id', uid)
        .order('sent_at', { ascending: true })
        .limit(1)

    if (direct?.[0]?.id) return direct[0].id

    const { data: mappings } = await sb
        .from('lineworks_staff_mappings')
        .select('staff_name')
        .eq('lineworks_user_id', uid)

    const staffNames = (mappings || []).map((m) => trim(m.staff_name)).filter(Boolean)
    if (staffNames.length === 0) return null

    const { data: byStaff } = await sb
        .from('repair_lineworks_notifications')
        .select('id')
        .eq('status', 'pending')
        .in('staff_name', staffNames)
        .order('sent_at', { ascending: true })
        .limit(1)

    return byStaff?.[0]?.id ?? null
}

export function isLineWorksAckText(text: unknown): boolean {
    const t = trim(text)
    return t.length > 0 && (LINEWORKS_ACK_TEXTS.has(t) || LINEWORKS_STAFF_CONFIRM_BUTTON_RE.test(t))
}

/** ボタン表示テキストから案件番号を取得（postback 未着時のフォールバック） */
export function parseLineWorksStaffConfirmButtonText(
    text: unknown,
): { requestNo: number | null } | null {
    const t = trim(text)
    const m = t.match(LINEWORKS_STAFF_CONFIRM_BUTTON_RE)
    if (!m) return null
    const requestNo = m[1] ? Number.parseInt(m[1], 10) : null
    return { requestNo: requestNo != null && !Number.isNaN(requestNo) ? requestNo : null }
}

export function parseLineWorksRepairingButtonText(
    text: unknown,
): { requestNo: number | null } | null {
    const t = trim(text)
    const m = t.match(LINEWORKS_REPAIRING_BUTTON_RE)
    if (!m) return null
    const requestNo = m[1] ? Number.parseInt(m[1], 10) : null
    return { requestNo: requestNo != null && !Number.isNaN(requestNo) ? requestNo : null }
}

/** 案件番号から pending 通知 ID（同一案件に複数担当者がいる場合は直近送信分） */
export async function findLineWorksNotificationIdByRequestNo(
    requestNo: number,
): Promise<string | null> {
    if (!Number.isFinite(requestNo) || requestNo <= 0) return null

    const sb = getSupabaseAdmin()
    const { data: repair } = await sb
        .from('repair_requests')
        .select('id')
        .eq('request_no', requestNo)
        .maybeSingle()

    if (!repair?.id) return null

    const { data: rows } = await sb
        .from('repair_lineworks_notifications')
        .select('id')
        .eq('repair_request_id', repair.id)
        .eq('status', 'pending')
        .order('sent_at', { ascending: false })
        .limit(1)

    return rows?.[0]?.id ?? null
}

/** postback「確認しました」 */
export async function acknowledgeRepairLineWorksNotification(
    notificationId: string,
    lineWorksUserId: string,
): Promise<{ ok: boolean; requestNo?: number; statusUpdated?: boolean; error?: string }> {
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
        const statusResult = await upgradeRepairStatusToStaffConfirmed(sb, row.repair_request_id)
        const { data: repair } = await sb
            .from('repair_requests')
            .select('request_no')
            .eq('id', row.repair_request_id)
            .single()
        return {
            ok: true,
            requestNo: repair?.request_no,
            statusUpdated: statusResult.updated,
            error: statusResult.error,
        }
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

    const statusResult = await upgradeRepairStatusToStaffConfirmed(sb, row.repair_request_id)
    if (statusResult.error) {
        console.error('repair_requests status -> staff_confirmed:', statusResult.error)
    }

    if (statusResult.updated) {
        const { data: repairRow } = await sb
            .from('repair_requests')
            .select('received_via')
            .eq('id', row.repair_request_id)
            .single()
        if (trim(repairRow?.received_via) === 'line') {
            await notifyRepairCustomerLineStatus(sb, row.repair_request_id).catch((e) =>
                console.warn('line customer notify (staff_confirmed):', e),
            )
        }
    }

    const { data: repair } = await sb
        .from('repair_requests')
        .select('request_no')
        .eq('id', row.repair_request_id)
        .single()

    return {
        ok: true,
        requestNo: repair?.request_no,
        statusUpdated: statusResult.updated,
        error: statusResult.error,
    }
}

const LINEWORKS_REPAIRING_TEXTS = new Set(['修理中', '修理開始', '作業開始'])

export function isLineWorksRepairingText(text: unknown): boolean {
    const t = trim(text)
    return t.length > 0 && (LINEWORKS_REPAIRING_TEXTS.has(t) || LINEWORKS_REPAIRING_BUTTON_RE.test(t))
}

/** postback「修理中」: ステータス repairing + 依頼者へLINE通知 */
export async function markRepairRepairingFromLineWorksNotification(
    notificationId: string,
    lineWorksUserId: string,
): Promise<{ ok: boolean; requestNo?: number; statusUpdated?: boolean; error?: string }> {
    const sb = getSupabaseAdmin()
    const { data: row, error } = await sb
        .from('repair_lineworks_notifications')
        .select('id, repair_request_id, staff_name, status, lineworks_user_id')
        .eq('id', notificationId)
        .single()

    if (error || !row) {
        return { ok: false, error: '通知が見つかりません' }
    }

    const { data: repair, error: repairErr } = await sb
        .from('repair_requests')
        .select('request_no, status, received_via')
        .eq('id', row.repair_request_id)
        .single()

    if (repairErr || !repair) {
        return { ok: false, error: '案件が見つかりません' }
    }

    const oldStatus = String(repair.status || 'received')
    if (oldStatus === 'repairing') {
        return { ok: true, requestNo: repair.request_no, statusUpdated: false }
    }
    if (oldStatus === 'completed' || oldStatus === 'billed' || oldStatus === 'closed') {
        return { ok: false, error: `すでに終了した案件です（${oldStatus}）` }
    }

    try {
        await persistRepairStatusTransition(
            sb,
            row.repair_request_id,
            oldStatus,
            'repairing',
            String(repair.received_via || ''),
        )
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, error: msg }
    }

    await sb
        .from('repair_lineworks_notifications')
        .update({
            status: 'acknowledged',
            acknowledged_at: new Date().toISOString(),
            lineworks_user_id: lineWorksUserId || row.lineworks_user_id,
        })
        .eq('id', notificationId)

    return {
        ok: true,
        requestNo: repair.request_no,
        statusUpdated: true,
    }
}

/** 案件画面で「担当者確認」にしたあと、LINE WORKS へ確認メッセージを送る */
export async function confirmRepairLineWorksFromWeb(
    repairRequestId: string,
): Promise<RepairLineWorksNotifyResult> {
    if (!isLineWorksConfigured()) {
        return { ok: true, skipped: true, reason: 'LINE WORKS 未設定' }
    }

    const sb = getSupabaseAdmin()
    const { data: repair, error: repairErr } = await sb
        .from('repair_requests')
        .select('request_no, status')
        .eq('id', repairRequestId)
        .single()

    if (repairErr || !repair) {
        return { ok: false, error: repairErr?.message || '案件が見つかりません' }
    }

    const { data: rows, error: listErr } = await sb
        .from('repair_lineworks_notifications')
        .select('id, staff_name, lineworks_user_id, status')
        .eq('repair_request_id', repairRequestId)

    if (listErr) return { ok: false, error: listErr.message }

    const targets = (rows || []).filter((r) => trim(r.lineworks_user_id))
    if (targets.length === 0) {
        return { ok: true, sent: 0, skipped: true, reason: 'LINE WORKS 通知履歴なし' }
    }

    const now = new Date().toISOString()
    const ackText = `修理依頼 #${repair.request_no} を確認しました。担当者確認を記録しました。`
    let sent = 0
    let lastError: string | null = null

    for (const row of targets) {
        if (row.status !== 'acknowledged') {
            const { error: upErr } = await sb
                .from('repair_lineworks_notifications')
                .update({
                    status: 'acknowledged',
                    acknowledged_at: now,
                })
                .eq('id', row.id)
            if (upErr) {
                lastError = upErr.message
                continue
            }
        }
        try {
            await sendLineWorksUserMessage(trim(row.lineworks_user_id), {
                type: 'text',
                text: ackText,
            })
            sent++
            await logNotify(sb, repairRequestId, trim(row.staff_name), 'sent')
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            lastError = `${row.staff_name}: ${msg}`
            await logNotify(sb, repairRequestId, trim(row.staff_name), 'failed', msg)
        }
    }

    if (sent === 0) {
        return { ok: false, error: lastError || 'LINE WORKS 確認メッセージ送信に失敗' }
    }
    return { ok: true, sent }
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
