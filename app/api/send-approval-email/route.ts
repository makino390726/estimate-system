import { Resend } from 'resend'
import { NextResponse } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
  try {
    const { email, caseId, subject, approvedBy, nextApprover, isReject, rejectMessage } = await request.json()

    console.log('メール送信リクエスト受信:', { email, caseId })

    // ★ 開発環境では自分のアドレスに送信
    const isDevelopment = process.env.NODE_ENV === 'development'
    const toEmail = isDevelopment ? 'smata2696@gmail.com' : email

    if (isDevelopment && email !== 'smata2696@gmail.com') {
      console.log(`⚠️ 開発環境: ${email} → ${toEmail} にリダイレクト`)
    }

    // メール本文の作成
    const approvalUrl = `http://localhost:3000/cases/approval/${caseId}`
    const message = isReject && rejectMessage 
      ? `${rejectMessage}\n\n案件ID: ${caseId}\n件名: ${subject}\n\n以下のリンクから案件を確認してください:\n${approvalUrl}`
      : `${approvedBy}が承認しました。\n\n次の承認者: ${nextApprover}\n\n以下のリンクから案件を確認してください:\n${approvalUrl}`

    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: toEmail,
      subject: isDevelopment && email !== toEmail
        ? `【開発環境・本来の宛先: ${email}】案件の承認をお願いします` 
        : '【承認依頼】案件の承認をお願いします',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          ${isDevelopment && email !== toEmail ? `
          <div style="background-color: #fff3cd; padding: 12px; border: 2px solid #ffc107; border-radius: 4px; margin-bottom: 20px;">
            <strong>⚠️ 開発環境</strong><br>
            本来の宛先: <strong>${email}</strong><br>
            実際の送信先: <strong>${toEmail}</strong>
          </div>` : ''}
          
          <h2 style="color: #333;">案件承認依頼</h2>
          <p>以下の案件の承認をお願いします。</p>
          
          <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p><strong>案件ID:</strong> ${caseId}</p>
          </div>
          
          <a href="http://localhost:3000/cases/approval/${caseId}" 
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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('メール送信成功:', data)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('メール送信エラー:', error)
    return NextResponse.json({ error: 'メール送信に失敗しました' }, { status: 500 })
  }
}