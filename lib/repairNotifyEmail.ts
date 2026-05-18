import { Resend } from 'resend'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
    resolveRepairNotifyScope,
    staffMatchesRepairBranch,
} from '@/lib/repairNotifyRecipients'
import { formatRepairCategoryDisplay } from '@/lib/customerRegisterSheetTypes'
import { getRepairDetailUrl } from '@/lib/repairDetailUrl'

export type RepairNotifyResult = {
    ok: boolean
    skipped?: boolean
    reason?: string
    sent?: number
    recipients?: string[]
    error?: string
}

const RECEIVED_VIA_LABELS: Record<string, string> = {
    line: 'LINE',
    phone: '電話',
    web: 'Webフォーム',
    visit: '来訪',
    other: 'その他',
}

function trim(v: unknown) {
    return typeof v === 'string' ? v.trim() : ''
}

function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    return createClient(url, key)
}

function getExtraNotifyEmails(): string[] {
    const env = trim(process.env.REPAIR_NOTIFY_EXTRA_EMAILS)
    if (!env) return []
    return env.split(',').map((s) => s.trim()).filter((e) => e.includes('@'))
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/**
 * 修理依頼登録時、管轄営業所に対応する部署の担当者（email あり）へ通知メールを送信。
 * 管轄営業所が未設定の場合は管理部・技術部（または環境変数で指定）へ送る。
 */
export async function sendRepairRequestEmails(repairRequestId: string): Promise<RepairNotifyResult> {
    const apiKey = trim(process.env.RESEND_API_KEY)
    const mailFromRaw = trim(process.env.MAIL_FROM)
    if (!apiKey) {
        return { ok: false, error: 'RESEND_API_KEY is missing' }
    }
    if (!mailFromRaw) {
        return { ok: false, error: 'MAIL_FROM is missing' }
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
        .select('id, name, email, department, branch_id')

    if (staffErr) {
        return { ok: false, error: staffErr.message }
    }

    const assignedStaff = trim(repair.assigned_staff)
    let matchedForEmail = (staffRows || []).filter((s) =>
        staffMatchesRepairBranch(s, branchId, departmentNames),
    )
    if (assignedStaff) {
        const byName = (staffRows || []).filter((s) => trim(s.name) === assignedStaff)
        matchedForEmail = byName.length > 0 ? byName : matchedForEmail.filter((s) => trim(s.name) === assignedStaff)
    }

    const fromStaff = matchedForEmail
        .map((s) => trim(s.email))
        .filter((e) => e.length > 0 && e.includes('@'))

    const uniqueRecipients = [...new Set([...fromStaff, ...getExtraNotifyEmails()])]
    if (uniqueRecipients.length === 0) {
        return {
            ok: true,
            skipped: true,
            reason: `no staff with email for departments (${departmentNames.join(' / ')})`,
        }
    }

    const isDevelopment = process.env.NODE_ENV !== 'production'
    const devRedirectTo = trim(process.env.DEV_EMAIL_TO) || 'test@sanshu.co.jp'
    const detailUrl = getRepairDetailUrl(repair.id)

    const priorityLabels: Record<string, string> = {
        urgent: '緊急',
        high: '高',
        normal: '通常',
        low: '低',
    }
    const priority = priorityLabels[repair.priority] || repair.priority || '通常'
    const via = RECEIVED_VIA_LABELS[repair.received_via] || repair.received_via || '-'
    const subject = `【修理受付】#${repair.request_no} ${repair.customer_name}様（${branchLabel}）`
    const symptomHtml = escapeHtml(String(repair.symptom || '')).replace(/\n/g, '<br>')

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
        <h2 style="margin: 0 0 12px 0;">新規修理依頼のお知らせ</h2>
        <p style="margin: 0 0 16px 0;">管轄: <strong>${escapeHtml(branchLabel)}</strong></p>
        <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
          <tr><td style="padding: 6px 12px 6px 0; color: #64748b;">受付番号</td><td><strong>#${repair.request_no}</strong></td></tr>
          <tr><td style="padding: 6px 12px 6px 0; color: #64748b;">優先度</td><td>${escapeHtml(priority)}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; color: #64748b;">顧客名</td><td>${escapeHtml(repair.customer_name || '-')}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; color: #64748b;">住所</td><td>${escapeHtml(repair.customer_address || '-')}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; color: #64748b;">電話</td><td>${escapeHtml(repair.customer_phone || '-')}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; color: #64748b;">携帯</td><td>${escapeHtml(repair.customer_mobile || '-')}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; color: #64748b;">分野</td><td>${escapeHtml(formatRepairCategoryDisplay(repair.category))}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; color: #64748b;">型式</td><td>${escapeHtml(repair.model || '-')}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; color: #64748b;">症状</td><td>${symptomHtml}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; color: #64748b;">担当者</td><td>${escapeHtml(repair.assigned_staff || '未割当')}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; color: #64748b;">受付経路</td><td>${escapeHtml(via)}</td></tr>
        </table>
        <p style="margin: 20px 0 0 0;">
          <a href="${detailUrl}" style="display: inline-block; padding: 10px 18px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px;">案件詳細を開く（#${repair.request_no}）</a>
        </p>
      </div>
    `

    const resend = new Resend(apiKey)
    const fromHeader = mailFromRaw.includes('<') ? mailFromRaw : `Sanshu Repair <${mailFromRaw}>`
    let sent = 0
    const actuallySent: string[] = []

    for (const email of uniqueRecipients) {
        const toEmail = isDevelopment ? devRedirectTo : email
        const mailSubject =
            isDevelopment && email !== toEmail
                ? `【開発・宛先:${email}】${subject}`
                : subject

        const { error } = await resend.emails.send({
            from: fromHeader,
            to: toEmail,
            subject: mailSubject,
            html: isDevelopment && email !== toEmail
                ? `<p style="background:#fff3cd;padding:8px;">開発環境: 本来の宛先 <strong>${escapeHtml(email)}</strong></p>${htmlBody}`
                : htmlBody,
        })

        if (error) {
            console.error('repair notify email failed:', email, error)
            continue
        }
        sent++
        actuallySent.push(email)
    }

    if (sent === 0) {
        return { ok: false, error: 'all sends failed' }
    }

    console.log(`repair notify: sent ${sent} email(s) for request #${repair.request_no}`, actuallySent)
    return { ok: true, sent, recipients: actuallySent }
}

export { notifyRepairRequestCreated } from '@/lib/repairStaffNotify'
