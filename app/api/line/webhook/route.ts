import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
    verifySignature,
    replyMessage,
    getProfile,
    getContentUrl,
    sendRepairConfirmation,
} from '@/lib/lineClient'

export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xdiqyslnokscgcuoakle.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getSupabase() {
    if (supabaseServiceKey) {
        return createClient(supabaseUrl, supabaseServiceKey)
    }
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkaXF5c2xub2tzY2djdW9ha2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzOTQyMDMsImV4cCI6MjA3Nzk3MDIwM30.aGgaWQvsNhlnh6GO7wAgbTcL9JFpvT2xKnUQMZcnZuk'
    return createClient(supabaseUrl, anonKey)
}

/**
 * LINE Messaging API Webhook
 *
 * LINE Developers > Messaging API > Webhook URL に以下を設定:
 *   https://your-domain.vercel.app/api/line/webhook
 *
 * 処理フロー:
 *   1. 顧客がLINEでメッセージ送信（テキスト/画像/動画）
 *   2. このWebhookが受信し、repair_requests テーブルに自動登録
 *   3. 顧客にFlex Messageで受付確認を返信
 *   4. 担当者に通知（line_staff_mappings テーブルで紐付け）
 *
 * 対話フロー（ステート管理）:
 *   - 「修理」「故障」「壊れた」等のキーワード → 修理受付モード開始
 *   - 型式・症状を順に聞く → repair_requests に登録
 *   - 画像・動画 → 受付中の案件に添付
 */

type LineEvent = {
    type: string
    replyToken: string
    source: { type: string; userId: string; groupId?: string }
    message?: {
        type: string
        id: string
        text?: string
        contentProvider?: { type: string }
    }
    timestamp: number
}

type ConversationState = {
    step: 'idle' | 'waiting_name' | 'waiting_model' | 'waiting_symptom' | 'waiting_more'
    customer_name?: string
    model?: string
    symptom?: string
    photo_urls?: string[]
    video_urls?: string[]
    repair_request_id?: string
}

const conversations = new Map<string, ConversationState>()

const REPAIR_TRIGGERS = ['修理', '故障', '壊れ', '動かない', 'エラー', '異常', '停止', '火がつかない', '温度', '異音', '水漏れ', '煙']

function isRepairTrigger(text: string): boolean {
    return REPAIR_TRIGGERS.some(t => text.includes(t))
}

export async function POST(request: Request) {
    try {
        const bodyText = await request.text()

        const signature = request.headers.get('x-line-signature') || ''
        if (process.env.LINE_CHANNEL_SECRET) {
            const valid = await verifySignature(bodyText, signature)
            if (!valid) {
                return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
            }
        }

        const body = JSON.parse(bodyText)
        const events: LineEvent[] = body.events || []

        for (const event of events) {
            if (event.type !== 'message' || !event.source.userId) continue
            await handleMessage(event)
        }

        return NextResponse.json({ status: 'ok' })
    } catch (e: any) {
        console.error('LINE Webhook error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

// GET は LINE Developers の Webhook URL 検証用
export async function GET() {
    return NextResponse.json({ status: 'ok' })
}

async function handleMessage(event: LineEvent) {
    const userId = event.source.userId
    const msg = event.message
    if (!msg) return

    const state = conversations.get(userId) || { step: 'idle' }

    // 画像・動画は添付として処理
    if (msg.type === 'image' || msg.type === 'video') {
        await handleMedia(event, state, userId, msg.type)
        return
    }

    if (msg.type !== 'text' || !msg.text) return
    const text = msg.text.trim()

    switch (state.step) {
        case 'idle':
            if (isRepairTrigger(text)) {
                conversations.set(userId, { step: 'waiting_name' })
                await replyMessage(event.replyToken,
                    '修理受付を開始します。\n\nまず、お名前（会社名）をお送りください。')
            } else {
                await replyMessage(event.replyToken,
                    'お問い合わせありがとうございます。\n\n修理のご依頼は「修理依頼」とお送りください。\n\n機械の故障・異常・エラー等のキーワードでも受付を開始できます。')
            }
            break

        case 'waiting_name':
            state.customer_name = text
            state.step = 'waiting_model'
            conversations.set(userId, state)
            await replyMessage(event.replyToken,
                `${text} 様、ありがとうございます。\n\n次に、機械の型式（型番）をお送りください。\n不明な場合は「不明」とお送りください。`)
            break

        case 'waiting_model':
            state.model = text === '不明' ? undefined : text
            state.step = 'waiting_symptom'
            conversations.set(userId, state)
            await replyMessage(event.replyToken,
                'ありがとうございます。\n\n症状を具体的にお送りください。\n例: 「火がつかない」「温度が上がらない」「異音がする」')
            break

        case 'waiting_symptom':
            state.symptom = text
            state.step = 'waiting_more'
            conversations.set(userId, state)
            state.photo_urls = []
            state.video_urls = []
            await registerRepairRequest(event, state, userId)
            break

        case 'waiting_more':
            if (text === '完了' || text === '以上' || text === '終了') {
                conversations.delete(userId)
                await replyMessage(event.replyToken,
                    'ありがとうございます。担当者より折り返しご連絡いたします。')
            } else {
                // 追加情報としてメモに追記
                if (state.repair_request_id) {
                    const sb = getSupabase()
                    const { data } = await sb.from('repair_requests').select('notes').eq('id', state.repair_request_id).single()
                    const existingNotes = data?.notes || ''
                    await sb.from('repair_requests').update({
                        notes: existingNotes ? `${existingNotes}\n[LINE追加] ${text}` : `[LINE追加] ${text}`,
                    }).eq('id', state.repair_request_id)
                }
                await replyMessage(event.replyToken,
                    '追加情報を記録しました。\n\n写真や動画も送信できます。\n完了の場合は「完了」とお送りください。')
            }
            break
    }
}

async function handleMedia(event: LineEvent, state: ConversationState, userId: string, mediaType: 'image' | 'video') {
    const messageId = event.message!.id
    const contentUrl = await getContentUrl(messageId)

    if (state.step === 'waiting_more' && state.repair_request_id) {
        const sb = getSupabase()
        const { data } = await sb.from('repair_requests').select('photo_urls, video_urls').eq('id', state.repair_request_id).single()

        if (mediaType === 'image') {
            const urls = [...(data?.photo_urls || []), contentUrl]
            await sb.from('repair_requests').update({ photo_urls: urls }).eq('id', state.repair_request_id)
        } else {
            const urls = [...(data?.video_urls || []), contentUrl]
            await sb.from('repair_requests').update({ video_urls: urls }).eq('id', state.repair_request_id)
        }

        await replyMessage(event.replyToken,
            `${mediaType === 'image' ? '写真' : '動画'}を受け付けました。\n\n他にも写真・動画・追加情報があればお送りください。\n完了の場合は「完了」とお送りください。`)
    } else {
        // 受付モード外でメディアが来た場合は受付開始を案内
        await replyMessage(event.replyToken,
            '写真・動画を受け取りました。\n\n修理のご依頼は「修理依頼」とお送りいただくと、受付を開始します。')
    }
}

async function registerRepairRequest(event: LineEvent, state: ConversationState, userId: string) {
    const sb = getSupabase()

    // LINEプロフィール取得
    const profile = await getProfile(userId)

    const payload = {
        received_via: 'line',
        priority: 'normal',
        status: 'received',
        customer_name: state.customer_name || profile?.displayName || 'LINE顧客',
        symptom: state.symptom || '',
        model: state.model || null,
        line_user_id: userId,
        line_message_id: event.message?.id || null,
        photo_urls: state.photo_urls || [],
        video_urls: state.video_urls || [],
        notes: `LINE受付 (表示名: ${profile?.displayName || '不明'})`,
    }

    const { data, error } = await sb.from('repair_requests').insert(payload).select('id, request_no').single()

    if (error) {
        console.error('修理案件登録エラー:', error)
        await replyMessage(event.replyToken,
            '申し訳ございません、受付処理中にエラーが発生しました。お手数ですがお電話にてご連絡ください。')
        conversations.delete(userId)
        return
    }

    state.repair_request_id = data.id
    conversations.set(userId, state)

    // 顧客に受付完了を通知
    await sendRepairConfirmation(userId, data.request_no, state.symptom || '', state.model)

    // 追加があれば促す（replyTokenは1回しか使えないので、sendRepairConfirmationはpushで送信済）
    await replyMessage(event.replyToken,
        `修理受付が完了しました（受付番号: #${data.request_no}）\n\n写真や動画があればお送りください。\n完了の場合は「完了」とお送りください。`)
}
