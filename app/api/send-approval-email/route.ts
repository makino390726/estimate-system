import { Resend } from 'resend'
import { NextResponse } from 'next/server'

// Edge だとライブラリ相性で落ちることがあるので Node 固定
export const runtime = 'nodejs'

type ReqBody = {
  email?: string
  caseId?: string
  subject?: string
  approvedBy?: string
  nextApprover?: string
  isReject?: boolean
  rejectMessage?: string
}

const toStr = (v: unknown) => (typeof v === 'string' ? v : '')
const trim = (v: unknown) => toStr(v).trim()

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ReqBody

    const email = trim(body.email)
    const caseId = trim(body.caseId)
    const subject = trim(body.subject)
    const approvedBy = trim(body.approvedBy)
    const nextApprover = trim(body.nextApprover)
    const isReject = !!body.isReject
    const rejectMessage = trim(body.rejectMessage)

    const apiKey = trim(process.env.RESEND_API_KEY)
    const mailFromRaw = trim(process.env.MAIL_FROM)

    console.log('メール送信リクエスト受信:', {
      email,
      caseId,
      subject,
      approvedBy,
      nextApprover,
      isReject,
      rejectMessage,
      NODE_ENV: process.env.NODE_ENV,
      RESEND_KEY_SET: !!apiKey,
      MAIL_FROM: mailFromRaw,
    })

    // =========================================================
    // 必須チェック（ここで理由を返す）
    // =========================================================
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'RESEND_API_KEY is missing' },
        { status: 500 }
      )
    }
    if (!mailFromRaw) {
      return NextResponse.json(
        { ok: false, error: 'MAIL_FROM is missing (Resendで認証済みの差出人を設定してください)' },
        { status: 500 }
      )
    }
    if (!email) {
      return NextResponse.json({ ok: false, error: 'email is missing' }, { status: 400 })
    }
    if (!caseId) {
      return NextResponse.json({ ok: false, error: 'caseId is missing' }, { status: 400 })
    }

    // =========================================================
    // 開発 / 本番 判定
    // =========================================================
    const isDevelopment = process.env.NODE_ENV !== 'production'

    // 開発環境の宛先リダイレクト（環境変数で設定できるように）
    const devRedirectTo = trim(process.env.DEV_EMAIL_TO) || 'test@sanshu.co.jp'
    const toEmail = isDevelopment ? devRedirectTo : email

    if (isDevelopment && email !== toEmail) {
      console.log(`⚠️ 開発環境: ${email} → ${toEmail} にリダイレクト`)
    }

    // =========================================================
    // URL 組み立て（環境変数があれば優先）
    // =========================================================
    const baseUrl =
      (isDevelopment ? trim(process.env.LOCAL_BASE_URL) : trim(process.env.PROD_BASE_URL)) ||
      (isDevelopment ? 'http://localhost:3000' : 'https://estimate-system-delta.vercel.app')

    const approvalUrl = `${baseUrl}/cases/approval/${caseId}`

    // =========================================================
    // メール本文
    // =========================================================
    const safeSubject = subject || '件名不明'
    const safeApprovedBy = approvedBy || '担当者'
    const safeNextApprover = nextApprover || '承認者'

    const message =
      isReject && rejectMessage
        ? `${rejectMessage}\n\n案件ID: ${caseId}\n件名: ${safeSubject}\n\n以下のリンクから案件を確認してください:\n${approvalUrl}`
        : `${safeApprovedBy}が承認しました。\n\n次の承認者: ${safeNextApprover}\n\n以下のリンクから案件を確認してください:\n${approvalUrl}`

    // =========================================================
    // Resend 送信（★fromは必ず認証済みを使う）
    //   ※ "Name <email>" 形式にするのが安全
    // =========================================================
    const resend = new Resend(apiKey)

    const mailSubject =
      isDevelopment && email !== toEmail
        ? `【開発環境・本来の宛先: ${email}】${isReject ? '差し戻し' : '案件の承認'}をお願いします`
        : isReject
          ? `【差し戻し】${safeSubject}`
          : `【承認依頼】${safeSubject}`

    const fromHeader = `Sanshu Approval <no-reply@sanshu.co.jp>`

    const { data, error } = await resend.emails.send({
      from: fromHeader,
      to: toEmail,
      subject: mailSubject,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          ${
            isDevelopment && email !== toEmail
              ? `
          <div style="background-color: #fff3cd; padding: 12px; border: 2px solid #ffc107; border-radius: 4px; margin-bottom: 20px;">
            <strong>⚠️ 開発環境</strong><br>
            本来の宛先: <strong>${email}</strong><br>
            実際の送信先: <strong>${toEmail}</strong>
          </div>`
              : ''
          }

          <h2 style="color: #333;">案件通知</h2>
          <p>${isReject ? '差し戻しが発生しました。内容を確認してください。' : '以下の案件の承認をお願いします。'}</p>

          <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p><strong>案件ID:</strong> ${caseId}</p>
            <p><strong>件名:</strong> ${safeSubject}</p>
          </div>

          <p>メッセージ:</p>
          <pre style="white-space: pre-wrap; background:#f9f9f9; padding:10px; border-radius:4px;">${message}</pre>

          <a href="${approvalUrl}"
             style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 10px;">
            承認画面を開く
          </a>

          <hr style="margin-top: 30px; border: none; border-top: 1px solid #ddd;">
          <p style="color: #999; font-size: 12px;">
            このメールは見積システムから自動送信されています。
          </p>
        </div>
      `,
    })

    if (error) {
      console.error('Resendエラー:', error)
      // Resendのエラー情報をできるだけ返す
      return NextResponse.json(
        {
          ok: false,
          error: (error as any)?.message ?? 'Resend send failed',
          detail: error,
          debug: { fromHeader, toEmail, baseUrl },
        },
        { status: 500 }
      )
    }

    console.log('メール送信成功:', data)
    return NextResponse.json({ ok: true, data })
  } catch (err: any) {
    console.error('メール送信エラー(想定外):', err)
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'メール送信に失敗しました', detail: String(err) },
      { status: 500 }
    )
  }
}
