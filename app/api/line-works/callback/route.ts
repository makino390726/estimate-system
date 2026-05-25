import { NextResponse } from 'next/server'
import {
    getLineWorksBotSecret,
    isLineWorksConfigured,
    parseRepairLineWorksPostback,
    sendLineWorksUserMessage,
    verifyLineWorksCallbackSignature,
} from '@/lib/lineWorksClient'
import {
    acknowledgeRepairLineWorksNotification,
    findLineWorksNotificationIdByRequestNo,
    findPendingLineWorksNotificationIdForUser,
    isLineWorksAckText,
    isLineWorksRepairingText,
    markRepairRepairingFromLineWorksNotification,
    parseLineWorksRepairingButtonText,
    parseLineWorksStaffConfirmButtonText,
} from '@/lib/repairLineWorksNotify'

export const runtime = 'nodejs'

type LineWorksCallbackBody = {
    type?: string
    source?: { userId?: string }
    data?: string
    content?: { type?: string; text?: string; postback?: string }
}

/** ボタンテンプレート(message action) / postback 両対応 */
function parseNotificationPostback(body: LineWorksCallbackBody) {
    const candidates: string[] = []
    if (body.type === 'postback' && body.data) {
        candidates.push(body.data)
    }
    if (body.content?.postback) {
        candidates.push(body.content.postback)
    }
    const text = body.content?.text
    if (text?.startsWith('repair_ack:') || text?.startsWith('repair_repairing:')) {
        candidates.push(text)
    }
    for (const raw of candidates) {
        if (!raw) continue
        const parsed = parseRepairLineWorksPostback(raw)
        if (parsed) return parsed
    }
    return null
}

/** postback なしでボタンラベル／表示テキストだけ届いた場合 */
async function resolvePostbackFromButtonText(text: string, userId: string) {
    if (isLineWorksRepairingText(text)) {
        const repairing = parseLineWorksRepairingButtonText(text)
        const notificationId =
            repairing?.requestNo != null
                ? await findLineWorksNotificationIdByRequestNo(repairing.requestNo)
                : await findPendingLineWorksNotificationIdForUser(userId)
        if (notificationId) {
            return { action: 'repairing' as const, notificationId }
        }
    }

    if (isLineWorksAckText(text)) {
        const staffConfirm = parseLineWorksStaffConfirmButtonText(text)
        const notificationId =
            staffConfirm?.requestNo != null
                ? await findLineWorksNotificationIdByRequestNo(staffConfirm.requestNo)
                : await findPendingLineWorksNotificationIdForUser(userId)
        if (notificationId) {
            return { action: 'staff_confirm' as const, notificationId }
        }
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
    let postback = parseNotificationPostback(body)

    if (!postback && body.type === 'message' && body.content?.type === 'text' && userId) {
        const text = body.content.text || ''
        if (isLineWorksAckText(text) || isLineWorksRepairingText(text)) {
            postback = await resolvePostbackFromButtonText(text, userId)
            if (postback) {
                console.log('LINE WORKS postback via text fallback:', postback.action, postback.notificationId, text)
            }
        }
    }

    if (!postback) {
        if (body.type === 'message' || body.type === 'postback') {
            const text = body.content?.text || ''
            console.log(
                'LINE WORKS callback: no repair postback in payload',
                JSON.stringify({
                    type: body.type,
                    contentType: body.content?.type,
                    text: text.slice(0, 80),
                    hasPostback: Boolean(body.content?.postback),
                    postbackPreview: body.content?.postback?.slice(0, 60),
                    hasData: Boolean(body.data),
                    userId: userId ? `${userId.slice(0, 8)}…` : '',
                }),
            )
            if (
                userId &&
                (text === '担当者確認' || text === '修理中' || text.startsWith('担当者確認 #') || text.startsWith('修理中 #'))
            ) {
                await sendLineWorksUserMessage(userId, {
                    type: 'text',
                    text:
                        'ボタンの処理に失敗しました。案件番号付きの新しい通知から再度タップするか、修理一覧でステータスを更新してください。\n' +
                        '（コールバック未設定・BOT_SECRET不一致の可能性があります）',
                }).catch(() => undefined)
            }
        }
        return new NextResponse(null, { status: 200 })
    }

    try {
        if (postback.action === 'repairing') {
            const result = await markRepairRepairingFromLineWorksNotification(
                postback.notificationId,
                userId,
            )
            if (!result.ok) {
                console.error('LINE WORKS repairing failed:', result.error, postback)
                if (userId) {
                    await sendLineWorksUserMessage(userId, {
                        type: 'text',
                        text: `修理中の記録に失敗しました: ${result.error || '不明'}`,
                    }).catch(() => undefined)
                }
                return new NextResponse(null, { status: 200 })
            }
            if (userId) {
                const no = result.requestNo != null ? `#${result.requestNo}` : ''
                const reply = result.statusUpdated
                    ? `修理依頼${no} を「修理中」に更新しました。LINE受付のお客様へ進捗を通知しました。`
                    : `修理依頼${no} はすでに修理中です。`
                await sendLineWorksUserMessage(userId, { type: 'text', text: reply })
            }
            return new NextResponse(null, { status: 200 })
        }

        const result = await acknowledgeRepairLineWorksNotification(postback.notificationId, userId)
        if (!result.ok) {
            console.error('LINE WORKS ack failed:', result.error, postback)
            if (userId) {
                await sendLineWorksUserMessage(userId, {
                    type: 'text',
                    text: `確認の処理に失敗しました: ${result.error || '不明'}`,
                }).catch(() => undefined)
            }
            return new NextResponse(null, { status: 200 })
        }
        if (result.error) {
            console.error('LINE WORKS ack status update:', result.error, postback)
        }
        if (userId) {
            const no = result.requestNo != null ? `#${result.requestNo}` : ''
            let reply: string
            if (result.statusUpdated) {
                reply =
                    `修理依頼${no} の担当者確認を受け付けました。` +
                    `案件ステータスを「担当者確認」に更新し、LINE受付のお客様へ通知しました。`
            } else if (result.error) {
                reply =
                    `修理依頼${no} の確認は記録しましたが、案件ステータスの更新に失敗しました。\n` +
                    `（${result.error}）\n` +
                    `Supabase で apply_repair_prerequisites.sql の実行が必要な場合があります。`
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
