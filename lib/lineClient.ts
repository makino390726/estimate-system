/**
 * LINE Messaging API クライアント
 *
 * 環境変数:
 *   LINE_CHANNEL_ACCESS_TOKEN  - LINE公式アカウントのチャネルアクセストークン
 *   LINE_CHANNEL_SECRET        - Webhookの署名検証用チャネルシークレット
 *
 * LINE Developers (https://developers.line.biz/) でMessaging APIチャネルを作成し、
 * .env.local に上記2つを設定してください。
 */

const LINE_API_BASE = 'https://api.line.me/v2/bot'
const LINE_DATA_API_BASE = 'https://api-data.line.me/v2/bot'

export function getLineConfig() {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
    const channelSecret = process.env.LINE_CHANNEL_SECRET || ''
    return { channelAccessToken, channelSecret }
}

function authHeaders() {
    const { channelAccessToken } = getLineConfig()
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`,
    }
}

/** Webhook署名検証 */
export async function verifySignature(body: string, signature: string): Promise<boolean> {
    const { channelSecret } = getLineConfig()
    if (!channelSecret) return false

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(channelSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))
    return expected === signature
}

/** テキストメッセージを返信 */
export async function replyMessage(replyToken: string, text: string) {
    await fetch(`${LINE_API_BASE}/message/reply`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            replyToken,
            messages: [{ type: 'text', text }],
        }),
    })
}

/** テキストメッセージをプッシュ送信 */
export async function pushMessage(userId: string, text: string) {
    await fetch(`${LINE_API_BASE}/message/push`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            to: userId,
            messages: [{ type: 'text', text }],
        }),
    })
}

/** 複数メッセージをプッシュ送信（Flex Message等対応） */
export async function pushMessages(userId: string, messages: Record<string, unknown>[]) {
    await fetch(`${LINE_API_BASE}/message/push`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ to: userId, messages }),
    })
}

/** ユーザープロフィール取得 */
export async function getProfile(userId: string) {
    const res = await fetch(`${LINE_API_BASE}/profile/${userId}`, {
        headers: authHeaders(),
    })
    if (!res.ok) return null
    return res.json() as Promise<{
        userId: string
        displayName: string
        pictureUrl?: string
        statusMessage?: string
    }>
}

/** メッセージに添付されたコンテンツ（画像・動画）のURLを取得 */
export async function getContentUrl(messageId: string): Promise<string> {
    return `${LINE_DATA_API_BASE}/message/${messageId}/content`
}

/** 画像・動画コンテンツをバイナリで取得 */
export async function getContentBuffer(messageId: string): Promise<Buffer> {
    const res = await fetch(`${LINE_DATA_API_BASE}/message/${messageId}/content`, {
        headers: { Authorization: `Bearer ${getLineConfig().channelAccessToken}` },
    })
    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
}

/** Flex Message で修理受付確認カードを送信 */
export async function sendRepairConfirmation(
    userId: string,
    requestNo: number,
    symptom: string,
    model?: string,
) {
    const flexMessage = {
        type: 'flex',
        altText: `修理受付完了: No.${requestNo}`,
        contents: {
            type: 'bubble',
            header: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: '#1e40af',
                paddingAll: '16px',
                contents: [
                    {
                        type: 'text',
                        text: '修理受付完了',
                        color: '#ffffff',
                        weight: 'bold',
                        size: 'lg',
                    },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                            { type: 'text', text: '受付番号', color: '#8c8c8c', size: 'sm', flex: 3 },
                            { type: 'text', text: `#${requestNo}`, weight: 'bold', size: 'sm', flex: 5 },
                        ],
                    },
                    ...(model
                        ? [{
                            type: 'box' as const,
                            layout: 'horizontal' as const,
                            contents: [
                                { type: 'text' as const, text: '型式', color: '#8c8c8c', size: 'sm' as const, flex: 3 },
                                { type: 'text' as const, text: model, size: 'sm' as const, flex: 5 },
                            ],
                        }]
                        : []),
                    {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                            { type: 'text', text: '症状', color: '#8c8c8c', size: 'sm', flex: 3 },
                            { type: 'text', text: symptom, size: 'sm', flex: 5, wrap: true },
                        ],
                    },
                    {
                        type: 'separator',
                        margin: 'lg',
                    },
                    {
                        type: 'text',
                        text: '担当者より折り返しご連絡いたします。',
                        size: 'xs',
                        color: '#8c8c8c',
                        margin: 'md',
                        wrap: true,
                    },
                ],
            },
        },
    }

    await pushMessages(userId, [flexMessage])
}

/** 担当者へ新規修理受付を通知（Flex Message） */
export async function notifyStaffNewRepair(
    staffLineUserId: string,
    requestNo: number,
    customerName: string,
    symptom: string,
    priority: string,
    model?: string,
) {
    const priorityLabel: Record<string, string> = {
        urgent: '🔴 緊急',
        high: '🟠 高',
        normal: '🔵 通常',
        low: '⚪ 低',
    }

    const text = [
        `【新規修理受付 #${requestNo}】`,
        `優先度: ${priorityLabel[priority] || priority}`,
        `顧客名: ${customerName}`,
        model ? `型式: ${model}` : null,
        `症状: ${symptom}`,
        '',
        '修理案件管理画面で詳細を確認してください。',
    ].filter(Boolean).join('\n')

    await pushMessage(staffLineUserId, text)
}
