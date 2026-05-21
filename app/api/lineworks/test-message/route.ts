import { NextResponse } from 'next/server'
import { isLineWorksConfigured, sendLineWorksUserMessage } from '@/lib/lineWorksClient'

export const runtime = 'nodejs'

type Body = { lineworks_user_id?: string }

/** 指定ユーザーへテストメッセージ（連携確認用） */
export async function POST(request: Request) {
    if (!isLineWorksConfigured()) {
        return NextResponse.json({ ok: false, error: 'LINE WORKS 未設定' }, { status: 503 })
    }

    const body = (await request.json().catch(() => ({}))) as Body
    const userId = String(body.lineworks_user_id || '').trim()
    if (!userId) {
        return NextResponse.json({ ok: false, error: 'lineworks_user_id is required' }, { status: 400 })
    }

    try {
        await sendLineWorksUserMessage(userId, {
            type: 'text',
            text: '【テスト】修理通知 LINE WORKS の連携確認です。このメッセージが届けば送信設定は正常です。',
        })
        return NextResponse.json({ ok: true, sent_to: userId })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
