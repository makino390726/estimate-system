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

import { buildStaffRepairNotifyFlex, type StaffRepairLineNotify } from '@/lib/repairStaffLineMessage'

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
    const res = await fetch(`${LINE_API_BASE}/message/reply`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            replyToken,
            messages: [{ type: 'text', text }],
        }),
    })
    if (!res.ok) {
        const errBody = await res.text()
        console.error('LINE replyMessage failed:', res.status, errBody)
    }
}

/** Quick Reply 付きテキストメッセージを返信 */
export async function replyWithQuickReply(
    replyToken: string,
    text: string,
    items: { label: string; text: string }[],
) {
    const res = await fetch(`${LINE_API_BASE}/message/reply`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            replyToken,
            messages: [
                {
                    type: 'text',
                    text,
                    quickReply: {
                        items: items.map(item => ({
                            type: 'action',
                            action: {
                                type: 'message',
                                label: item.label,
                                text: item.text,
                            },
                        })),
                    },
                },
            ],
        }),
    })
    if (!res.ok) {
        const errBody = await res.text()
        console.error('LINE replyWithQuickReply failed:', res.status, errBody)
    }
}

/** テキストメッセージをプッシュ送信 */
export async function pushMessage(userId: string, text: string) {
    const res = await fetch(`${LINE_API_BASE}/message/push`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            to: userId,
            messages: [{ type: 'text', text }],
        }),
    })
    if (!res.ok) {
        const errBody = await res.text()
        console.error('LINE pushMessage failed:', res.status, errBody)
    }
}

/** 複数メッセージをプッシュ送信（Flex Message等対応） */
export async function pushMessages(userId: string, messages: Record<string, unknown>[]) {
    const res = await fetch(`${LINE_API_BASE}/message/push`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ to: userId, messages }),
    })
    if (!res.ok) {
        const errBody = await res.text()
        console.error('LINE pushMessages failed:', res.status, errBody)
    }
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

/** 修理依頼「フォーム／チャット」選択用 Flex（reply / push 共通） */
function buildRepairMethodChoiceFlex(liffUrl: string) {
    return {
        type: 'flex' as const,
        altText: '修理依頼の受付方法を選択してください',
        contents: {
            type: 'bubble' as const,
            header: {
                type: 'box' as const,
                layout: 'vertical' as const,
                backgroundColor: '#1e40af',
                paddingAll: '16px',
                contents: [
                    {
                        type: 'text' as const,
                        text: '修理依頼受付',
                        color: '#ffffff',
                        weight: 'bold' as const,
                        size: 'lg' as const,
                    },
                    {
                        type: 'text' as const,
                        text: '受付方法をお選びください',
                        color: '#ffffffCC',
                        size: 'sm' as const,
                        margin: 'sm' as const,
                    },
                ],
            },
            body: {
                type: 'box' as const,
                layout: 'vertical' as const,
                spacing: 'md' as const,
                paddingAll: '20px',
                backgroundColor: '#ffffff',
                contents: [
                    {
                        type: 'box' as const,
                        layout: 'vertical' as const,
                        spacing: 'sm' as const,
                        contents: [
                            {
                                type: 'text' as const,
                                text: 'フォームで入力',
                                weight: 'bold' as const,
                                size: 'md' as const,
                                color: '#111111',
                            },
                            {
                                type: 'text' as const,
                                text: '入力フォームに必要事項を記入して送信します。写真添付も可能です。',
                                size: 'xs' as const,
                                color: '#8c8c8c',
                                wrap: true,
                            },
                        ],
                    },
                    {
                        type: 'button' as const,
                        action: {
                            type: 'uri' as const,
                            label: 'フォームで入力する',
                            uri: liffUrl,
                        },
                        style: 'primary' as const,
                        color: '#1e40af',
                        height: 'sm' as const,
                    },
                    {
                        type: 'separator' as const,
                        margin: 'lg' as const,
                    },
                    {
                        type: 'box' as const,
                        layout: 'vertical' as const,
                        spacing: 'sm' as const,
                        margin: 'md' as const,
                        contents: [
                            {
                                type: 'text' as const,
                                text: 'チャットで回答',
                                weight: 'bold' as const,
                                size: 'md' as const,
                                color: '#111111',
                            },
                            {
                                type: 'text' as const,
                                text: '質問に順番にお答えいただく形式です。',
                                size: 'xs' as const,
                                color: '#8c8c8c',
                                wrap: true,
                            },
                        ],
                    },
                    {
                        type: 'button' as const,
                        action: {
                            type: 'message' as const,
                            label: 'チャットで回答する',
                            text: 'チャットで修理依頼',
                        },
                        style: 'secondary' as const,
                        height: 'sm' as const,
                    },
                ],
            },
        },
    }
}

/** 修理受付方法の選択（replyToken 使用・修理フロー前半で呼ぶ） */
export async function sendRepairMethodChoice(replyToken: string, liffUrl: string) {
    const flexMessage = buildRepairMethodChoiceFlex(liffUrl)

    const res = await fetch(`${LINE_API_BASE}/message/reply`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            replyToken,
            messages: [flexMessage],
        }),
    })
    if (!res.ok) {
        const errBody = await res.text()
        console.error('LINE sendRepairMethodChoice failed:', res.status, errBody)
        throw new Error(`sendRepairMethodChoice failed: ${res.status} ${errBody}`)
    }
}

/** 同上 Flex をプッシュ送信（replyToken 消費後の修理フロー用） */
export async function pushRepairMethodChoice(userId: string, liffUrl: string) {
    await pushMessages(userId, [buildRepairMethodChoiceFlex(liffUrl)])
}

/** NotebookLM 検索リンク＋スキップボタンを送信 */
export async function sendNotebookLMSearch(
    replyToken: string,
    category: string,
    symptom: string,
    notebookUrl: string,
) {
    const flexMessage = {
        type: 'flex',
        altText: '状況検索 - NotebookLMで類似事例を確認できます',
        contents: {
            type: 'bubble',
            header: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: '#1a472a',
                paddingAll: '16px',
                contents: [
                    {
                        type: 'text',
                        text: '状況検索',
                        color: '#ffffff',
                        weight: 'bold',
                        size: 'lg',
                    },
                    {
                        type: 'text',
                        text: '類似事例をNotebookLMで検索できます',
                        color: '#ffffffCC',
                        size: 'xs',
                        margin: 'sm',
                    },
                ],
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                paddingAll: '20px',
                contents: [
                    {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        backgroundColor: '#f0f4f0',
                        cornerRadius: '8px',
                        paddingAll: '12px',
                        contents: [
                            {
                                type: 'text',
                                text: `種別: ${category}`,
                                size: 'sm',
                                color: '#333333',
                                weight: 'bold',
                            },
                            {
                                type: 'text',
                                text: `症状: ${symptom}`,
                                size: 'sm',
                                color: '#333333',
                                wrap: true,
                            },
                        ],
                    },
                    {
                        type: 'text',
                        text: '下のボタンでNotebookLMを開き、上記の情報をチャット欄にペーストして検索できます。',
                        size: 'xs',
                        color: '#8c8c8c',
                        wrap: true,
                        margin: 'md',
                    },
                    {
                        type: 'button',
                        action: {
                            type: 'uri',
                            label: 'NotebookLMで検索する',
                            uri: notebookUrl,
                        },
                        style: 'primary',
                        color: '#1a472a',
                        height: 'sm',
                    },
                    {
                        type: 'separator',
                        margin: 'lg',
                    },
                    {
                        type: 'button',
                        action: {
                            type: 'message',
                            label: 'スキップして次へ',
                            text: 'スキップ',
                        },
                        style: 'secondary',
                        height: 'sm',
                        margin: 'md',
                    },
                ],
            },
        },
    }

    const res = await fetch(`${LINE_API_BASE}/message/reply`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            replyToken,
            messages: [flexMessage],
        }),
    })
    if (!res.ok) {
        const errBody = await res.text()
        console.error('LINE sendNotebookLMSearch failed:', res.status, errBody)
        throw new Error(`sendNotebookLMSearch failed: ${res.status} ${errBody}`)
    }
}

/** 担当者へ新規修理受付を通知（Flex Message・案件詳細リンク付き） */
export async function notifyStaffNewRepair(
    staffLineUserId: string,
    input: StaffRepairLineNotify,
) {
    const flexMessage = buildStaffRepairNotifyFlex(input)
    await pushMessages(staffLineUserId, [flexMessage])
}
