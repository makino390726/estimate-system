import { Resend } from 'resend'
import { NextResponse } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
  try {
    const {
      email,
      caseId,
      subject,
      approvedBy,
      nextApprover,
      isReject,
      rejectMessage,
    } = await request.json()

    console.log('メール送信リクエスト受信:', {
      email,
      caseId,
      subject,
      approvedBy,
      nextApprover,
      isReject,
      rejectMessage,
      NODE_ENV: process.env.NODE_ENV,
      RESEND_KEY_SET: !!process.env.RESEND_API_KEY,
    })

    // =========================================================
    // ★ 開発 / 本番 判定
    // =========================================================
    const isDevelopment = process.env.NODE_ENV !== 'production'

    // 開発中は自分だけに飛ばす
    const toEmail = isDevelopment ? 'smata2696@gmail.com' : email

    if (isDevelopment && email !== toEmail) {
      console.log(`⚠️ 開発環境: ${email} → ${toEmail} にリダイレクト`)
    }

    // =========================================================
    // ★ 本番URLとローカルURLの出し分け
    //    ※ Vercel の実際のURLに合わせて変更してください
    // =========================================================
    const baseUrl = isDevelopment
      ? 'http://localhost:3000'
      : 'https://estimate-system-delta.vercel.app' // ← あなたの本番URL

    const approvalUrl = `${baseUrl}/cases/approval/${caseId}`

    // =========================================================
    // ★ メール本文
    // =========================================================
    const message =
      isReject && rejectMessage
        ? `${rejectMessage}\n\n案件ID: ${caseId}\n件名: ${subject}\n\n以下のリンクから案件を確認してください:\n${approvalUrl}`
        : `${approvedBy}が承認しました。\n\n次の承認者: ${nextApprover}\n\n以下のリンクから案件を確認してください:\n${approvalUrl}`

    // =========================================================
    // ★ Resend 送信
    //    → 送信元は Resend 共通ドメインを使用（認証不要）
    // =========================================================
    const { data, error } = await resend.emails.send({
      from: 'Sanshu Approval <no-reply@onresend.com>', // ★ここを利用
      to: toEmail,
      subject:
        isDevelopment && email !== toEmail
          ? `【開発環境・本来の宛先: ${email}】案件の承認をお願いします`
          : '【承認依頼】案件の承認をお願いします',
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
          
          <h2 style="color: #333;">案件承認依頼</h2>
          <p>以下の案件の承認をお願いします。</p>
          
          <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p><strong>案件ID:</strong> ${caseId}</p>
            <p><strong>件名:</strong> ${subject}</p>
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
      return NextResponse.json({ error: String(error) }, { status: 500 })
    }

    console.log('メール送信成功:', data)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('メール送信エラー(想定外):', error)
    return NextResponse.json(
      { error: 'メール送信に失敗しました', detail: String(error) },
      { status: 500 }
    )
  }
}
