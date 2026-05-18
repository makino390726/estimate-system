import { NextResponse } from 'next/server'
import {
    getLineWorksBotSecret,
    isLineWorksConfigured,
    parseRepairAckPostbackData,
    sendLineWorksUserMessage,
    verifyLineWorksCallbackSignature,
} from '@/lib/lineWorksClient'
import { acknowledgeRepairLineWorksNotification } from '@/lib/repairLineWorksNotify'

export const runtime = 'nodejs'

type LineWorksCallbackBody = {
    type?: string
    source?: { userId?: string }
    data?: string
}

export async function POST(request: Request) {
    if (!isLineWorksConfigured()) {
        return NextResponse.json({ error: 'LINE WORKS not configured' }, { status: 503 })
    }

    const rawBody = await request.text()
    const signature = request.headers.get('X-WORKS-Signature')

    if (getLineWorksBotSecret()) {
        if (!verifyLineWorksCallbackSignature(rawBody, signature)) {
            console.error('LINE WORKS callback: invalid signature')
            return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
        }
    } else {
        console.warn('LINE WORKS_BOT_SECRET unset: skipping signature verification')
    }

    let body: LineWorksCallbackBody
    try {
        body = JSON.parse(rawBody) as LineWorksCallbackBody
    } catch {
        return NextResponse.json({ error: 'invalid json' }, { status: 400 })
    }

    if (body.type !== 'postback' || !body.data) {
        return new NextResponse(null, { status: 200 })
    }

    const notificationId = parseRepairAckPostbackData(body.data)
    const userId = body.source?.userId || ''

    if (!notificationId) {
        return new NextResponse(null, { status: 200 })
    }

    void (async () => {
        try {
            const result = await acknowledgeRepairLineWorksNotification(notificationId, userId)
            if (userId && result.ok) {
                const no = result.requestNo != null ? `#${result.requestNo}` : ''
                await sendLineWorksUserMessage(userId, {
                    type: 'text',
                    text: `修理依頼${no} の確認を受け付けました。ありがとうございます。`,
                })
            }
        } catch (e) {
            console.error('LINE WORKS postback handler:', e)
        }
    })()

    return new NextResponse(null, { status: 200 })
}
