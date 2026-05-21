import { NextResponse } from 'next/server'

import {

    getLineWorksBotSecret,

    isLineWorksConfigured,

    parseRepairAckPostbackData,

    sendLineWorksUserMessage,

    verifyLineWorksCallbackSignature,

} from '@/lib/lineWorksClient'

import {

    acknowledgeRepairLineWorksNotification,

    findPendingLineWorksNotificationIdForUser,

    isLineWorksAckText,

} from '@/lib/repairLineWorksNotify'



export const runtime = 'nodejs'



type LineWorksCallbackBody = {

    type?: string

    source?: { userId?: string }

    data?: string

    content?: { type?: string; text?: string; postback?: string }

}



/** ボタンテンプレート(message action) / カルーセル等(postback action) 両対応 */

function parseAckNotificationId(body: LineWorksCallbackBody): string | null {

    const candidates: string[] = []

    if (body.type === 'postback' && body.data) {

        candidates.push(body.data)

    }

    if (body.content?.postback) {

        candidates.push(body.content.postback)

    }

    const text = body.content?.text

    if (text?.startsWith('repair_ack:')) {

        candidates.push(text)

    }

    for (const raw of candidates) {

        if (!raw) continue

        const id = parseRepairAckPostbackData(raw)

        if (id) return id

    }

    return null

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

        console.warn('LINEWORKS_BOT_SECRET unset: skipping signature verification')

    }



    let body: LineWorksCallbackBody

    try {

        body = JSON.parse(rawBody) as LineWorksCallbackBody

    } catch {

        return NextResponse.json({ error: 'invalid json' }, { status: 400 })

    }



    const userId = body.source?.userId || ''

    let notificationId = parseAckNotificationId(body)



    // ボタンではなく「確認しました」等のテキストだけ送った場合

    if (!notificationId && body.type === 'message' && body.content?.type === 'text' && userId) {

        if (isLineWorksAckText(body.content.text)) {

            notificationId = await findPendingLineWorksNotificationIdForUser(userId)

            if (notificationId) {

                console.log('LINE WORKS ack via text fallback:', notificationId)

            }

        }

    }



    if (!notificationId) {

        if (body.type === 'message' || body.type === 'postback') {

            console.log(

                'LINE WORKS callback: no repair_ack in payload',

                JSON.stringify({

                    type: body.type,

                    contentType: body.content?.type,

                    text: body.content?.text?.slice(0, 40),

                    hasPostback: Boolean(body.content?.postback),

                    hasData: Boolean(body.data),

                }),

            )

        }

        return new NextResponse(null, { status: 200 })

    }



    try {

        const result = await acknowledgeRepairLineWorksNotification(notificationId, userId)

        if (!result.ok) {

            console.error('LINE WORKS ack failed:', result.error, { notificationId })

            if (userId) {

                await sendLineWorksUserMessage(userId, {

                    type: 'text',

                    text: `確認の処理に失敗しました: ${result.error || '不明'}`,

                }).catch(() => undefined)

            }

            return new NextResponse(null, { status: 200 })

        }

        if (result.error) {

            console.error('LINE WORKS ack status update:', result.error, { notificationId })

        }

        if (userId) {

            const no = result.requestNo != null ? `#${result.requestNo}` : ''

            let reply: string

            if (result.statusUpdated) {

                reply = `修理依頼${no} の確認を受け付けました。案件ステータスを「担当者確認」に更新しました。`

            } else if (result.error) {

                reply =

                    `修理依頼${no} の確認は記録しましたが、案件ステータスの更新に失敗しました。\n` +

                    `（${result.error}）\n` +

                    `Supabase で add_repair_status_staff_confirmed.sql の実行が必要な場合があります。`

            } else {

                reply = `修理依頼${no} の確認を受け付けました。ありがとうございます。`

            }

            await sendLineWorksUserMessage(userId, { type: 'text', text: reply })

        }

    } catch (e) {

        console.error('LINE WORKS postback handler:', e)

    }



    return new NextResponse(null, { status: 200 })

}


