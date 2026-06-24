import { NextResponse } from 'next/server'
import { sendCaseApprovalLineWorksNotify } from '@/lib/caseApprovalLineWorksNotify'

export const runtime = 'nodejs'

type ReqBody = {
    email?: string
    staffName?: string
    lineWorksUserId?: string
    caseId?: string
    caseNo?: string | number | null
    subject?: string
    approvedBy?: string
    nextApprover?: string
    isReject?: boolean
    rejectMessage?: string
    rejectReason?: string
}

const trim = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as ReqBody

        const email = trim(body.email)
        const staffName = trim(body.staffName)
        const lineWorksUserId = trim(body.lineWorksUserId)
        const caseId = trim(body.caseId)
        const caseNo = body.caseNo ?? null
        const subject = trim(body.subject)
        const approvedBy = trim(body.approvedBy)
        const isReject = !!body.isReject
        const rejectReason = trim(body.rejectReason) || trim(body.rejectMessage)

        console.log('承認通知リクエスト受信 (LINE WORKS):', {
            lineWorksUserId,
            staffName,
            caseId,
            caseNo,
            subject,
            approvedBy,
            isReject,
            rejectReason: rejectReason ? '(あり)' : '(なし)',
        })

        if (!lineWorksUserId && !email && !staffName) {
            return NextResponse.json(
                { ok: false, error: 'lineWorksUserId、staffName のいずれかが必要です' },
                { status: 400 },
            )
        }
        if (!caseId) {
            return NextResponse.json({ ok: false, error: 'caseId is missing' }, { status: 400 })
        }

        const result = await sendCaseApprovalLineWorksNotify({
            email: email || undefined,
            staffName: staffName || undefined,
            lineWorksUserId: lineWorksUserId || undefined,
            caseId,
            caseNo,
            subject,
            approvedBy,
            isReject,
            rejectReason: isReject ? rejectReason : undefined,
        })

        if (!result.ok) {
            return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
        }

        return NextResponse.json({
            ok: true,
            channel: 'lineworks',
            staffName: result.staffName,
            lineWorksUserId: result.lineWorksUserId,
        })
    } catch (err: unknown) {
        console.error('承認通知エラー(想定外):', err)
        const message = err instanceof Error ? err.message : '通知送信に失敗しました'
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
