import type { SupabaseClient } from '@supabase/supabase-js'
import { findLineWorksStaffMapping } from '@/lib/lineworksStaffMappingDb'
import { isLineWorksConfigured, sendLineWorksUserMessage } from '@/lib/lineWorksClient'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

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

export function getCaseApprovalUrl(caseId: string): string {
    return `${getBaseUrl()}/cases/approval/${encodeURIComponent(caseId)}`
}

function formatCaseNo(caseNo: string | number | null | undefined): string {
    if (caseNo == null || caseNo === '') return '—'
    return String(caseNo)
}

function buildApprovalRequestMessage(params: {
    caseNo: string
    subject: string
    approvedBy: string
    approvalUrl: string
}) {
    const lines = [
        '【見積承認依頼】',
        `案件No: ${params.caseNo}`,
        `案件名: ${params.subject}`,
        '',
        `${params.approvedBy}より承認依頼があります。`,
        'システムを確認のうえ、承認処理をお願いします。',
    ]
    return {
        type: 'button_template',
        contentText: lines.join('\n'),
        actions: [
            {
                type: 'uri',
                label: '承認画面を開く',
                uri: params.approvalUrl,
            },
        ],
    }
}

function buildRejectMessage(params: {
    caseNo: string
    subject: string
    rejectReason: string
    approvalUrl: string
}) {
    const reasonLine = params.rejectReason || '（記載なし）'
    const lines = [
        '【見積差戻】',
        `案件No: ${params.caseNo}`,
        `案件名: ${params.subject}`,
        `差戻理由: ${reasonLine}`,
        '',
        '差戻になりました。システムを確認の上、再度承認申請してください。',
    ]
    return {
        type: 'button_template',
        contentText: lines.join('\n'),
        actions: [
            {
                type: 'uri',
                label: '案件を確認',
                uri: params.approvalUrl,
            },
        ],
    }
}

async function resolveStaffNameByEmail(sb: SupabaseClient, email: string): Promise<string | null> {
    const normalized = trim(email).toLowerCase()
    if (!normalized) return null

    const { data, error } = await sb.from('staffs').select('name, email')
    if (error) throw error

    const match = (data || []).find((row) => trim(row.email).toLowerCase() === normalized)
    return match ? trim(match.name) : null
}

async function resolveLineWorksRecipient(
    sb: SupabaseClient,
    input: { email?: string; staffName?: string; lineWorksUserId?: string },
): Promise<{ staffName: string; lineWorksUserId: string } | { error: string }> {
    const directId = trim(input.lineWorksUserId)
    if (directId) {
        const staffName = trim(input.staffName) || directId
        return { staffName, lineWorksUserId: directId }
    }

    let staffName = trim(input.staffName)
    const email = trim(input.email)

    if (!staffName && email) {
        staffName = (await resolveStaffNameByEmail(sb, email)) || ''
    }

    if (!staffName) {
        return {
            error: `通知先の担当者を特定できません。LINE WORKS ID または担当者名を指定してください。`,
        }
    }

    const mapping = await findLineWorksStaffMapping(sb, staffName)
    if (!mapping) {
        return {
            error: `担当者「${staffName}」の LINE WORKS 連携が未設定です。/lineworks-staff-register から登録してください。`,
        }
    }

    return { staffName: mapping.staff_name, lineWorksUserId: mapping.lineworks_user_id }
}

export type CaseApprovalLineWorksNotifyInput = {
    email?: string
    staffName?: string
    lineWorksUserId?: string
    caseId: string
    caseNo?: string | number | null
    subject?: string
    approvedBy?: string
    isReject?: boolean
    rejectReason?: string
}

export type CaseApprovalLineWorksNotifyResult =
    | { ok: true; staffName: string; lineWorksUserId: string }
    | { ok: false; error: string }

export async function sendCaseApprovalLineWorksNotify(
    input: CaseApprovalLineWorksNotifyInput,
    sb: SupabaseClient = getSupabaseAdmin(),
): Promise<CaseApprovalLineWorksNotifyResult> {
    if (!isLineWorksConfigured()) {
        return {
            ok: false,
            error: 'LINE WORKS の環境変数が未設定です（LINEWORKS_CLIENT_ID 等を確認してください）',
        }
    }

    const caseId = trim(input.caseId)
    if (!caseId) {
        return { ok: false, error: 'caseId is missing' }
    }

    const recipient = await resolveLineWorksRecipient(sb, {
        email: input.email,
        staffName: input.staffName,
        lineWorksUserId: input.lineWorksUserId,
    })
    if ('error' in recipient) {
        return { ok: false, error: recipient.error }
    }

    const caseNo = formatCaseNo(input.caseNo)
    const subject = trim(input.subject) || '件名不明'
    const approvalUrl = getCaseApprovalUrl(caseId)
    const isReject = !!input.isReject

    const content = isReject
        ? buildRejectMessage({
              caseNo,
              subject: subject.replace(/^【差し戻し】/, ''),
              rejectReason: trim(input.rejectReason),
              approvalUrl,
          })
        : buildApprovalRequestMessage({
              caseNo,
              subject,
              approvedBy: trim(input.approvedBy) || '担当者',
              approvalUrl,
          })

    try {
        await sendLineWorksUserMessage(recipient.lineWorksUserId, content)
        return {
            ok: true,
            staffName: recipient.staffName,
            lineWorksUserId: recipient.lineWorksUserId,
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, error: msg }
    }
}
