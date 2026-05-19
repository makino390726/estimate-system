import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
    verifySignature,
    replyMessage,
    pushMessage,
    replyWithQuickReply,
    getProfile,
    getContentUrl,
    sendRepairConfirmation,
    sendRepairMethodChoice,
    pushRepairMethodChoice,
} from '@/lib/lineClient'
import { notifyRepairRequestCreated } from '@/lib/repairStaffNotify'
import { repairCategoryToSheetType } from '@/lib/customerRegisterSheetTypes'
import {
    buildStaffLineHelpReply,
    buildStaffRegisterFailReply,
    buildStaffRegisterSuccessReply,
    isStaffLineHelpCommand,
    parseStaffRegisterCommand,
} from '@/lib/lineStaffRegisterWebhook'
import { resolveStaffName } from '@/lib/staffNameMatch'

export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xdiqyslnokscgcuoakle.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getSupabase() {
    if (supabaseServiceKey) {
        return createClient(supabaseUrl, supabaseServiceKey)
    }
    console.warn('SUPABASE_SERVICE_ROLE_KEY is not set – falling back to anon key. INSERT may be blocked by RLS.')
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
 * 処理フロー（概要）:
 *   - 修理: repair_requests 登録・LINE確認など
 *   - AI検索のみ: Dify 参照のみ、案件は作らない
 *
 * 対話フロー:
 *   - 修理: キーワード → 機種 → 症状 → AI参考 → チャット/フォーム選択 → 受付
 *   - AI検索のみ: 「検索」→ 機種 → 症状 → AI結果のみ（修理依頼へは進まない）
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
    step:
        | 'idle'
        | 'ai_search_waiting_category'
        | 'ai_search_waiting_symptom'
        | 'waiting_category'
        | 'waiting_symptom_prelim'
        | 'waiting_repair_ai_confirm'
        | 'waiting_name'
        | 'waiting_model'
        | 'waiting_symptom'
        | 'waiting_more'
    category?: string
    customer_name?: string
    model?: string
    symptom?: string
    photo_urls?: string[]
    video_urls?: string[]
    repair_request_id?: string
}

/** AI検索モード開始: 先頭が「検索」のみ（修理依頼フローと分離） */
function isAiSearchStart(text: string): boolean {
    const t = text.trim()
    return t === '検索' || t === '検索開始'
}

const DIFY_API_BASE = process.env.DIFY_API_BASE || 'https://api.dify.ai/v1'
const DIFY_API_KEY = process.env.DIFY_API_KEY || ''

const MACHINE_CATEGORIES = [
    'たばこ乾燥機',
    'ハウス暖房機',
    '光合成促進装置',
    '冷蔵庫',
    '食品乾燥機',
]

const conversations = new Map<string, ConversationState>()

const REPAIR_TRIGGERS = ['修理', '故障', '壊れ', '動かない', 'エラー', '異常', '停止', '火がつかない', '温度', '異音', '水漏れ', '煙']

function isRepairTrigger(text: string): boolean {
    return REPAIR_TRIGGERS.some(t => text.includes(t))
}

export async function POST(request: Request) {
    try {
        const bodyText = await request.text()
        console.log('LINE Webhook received:', bodyText.substring(0, 500))

        const signature = request.headers.get('x-line-signature') || ''
        console.log('LINE_CHANNEL_SECRET set:', !!process.env.LINE_CHANNEL_SECRET)
        console.log('LINE_CHANNEL_ACCESS_TOKEN set:', !!process.env.LINE_CHANNEL_ACCESS_TOKEN)

        if (process.env.LINE_CHANNEL_SECRET) {
            const valid = await verifySignature(bodyText, signature)
            if (!valid) {
                console.error('LINE Webhook: signature verification failed')
                return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
            }
            console.log('LINE Webhook: signature verified OK')
        }

        const body = JSON.parse(bodyText)
        const events: LineEvent[] = body.events || []
        console.log('LINE Webhook events count:', events.length)

        for (const event of events) {
            console.log('LINE event type:', event.type, 'message type:', event.message?.type, 'text:', event.message?.text)
            const userId = event.source?.userId
            if (!userId) continue

            if (event.type === 'follow') {
                await handleStaffFollow(event, userId)
                continue
            }

            if (event.type !== 'message') continue
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

async function handleStaffFollow(event: LineEvent, userId: string) {
    try {
        const profile = await getProfile(userId).catch(() => null)
        const text = buildStaffLineHelpReply(userId, profile?.displayName)
        await replyMessage(event.replyToken, text)
    } catch (e) {
        console.error('handleStaffFollow failed:', e)
    }
}

async function tryHandleStaffLineRegister(event: LineEvent, userId: string, text: string): Promise<boolean> {
    if (isStaffLineHelpCommand(text)) {
        const profile = await getProfile(userId).catch(() => null)
        await replyMessage(event.replyToken, buildStaffLineHelpReply(userId, profile?.displayName))
        return true
    }

    const staffName = parseStaffRegisterCommand(text)
    if (!staffName) return false

    const sb = getSupabase()
    const { data: staffRows, error: staffListErr } = await sb.from('staffs').select('name').order('name')
    if (staffListErr) {
        await replyMessage(event.replyToken, buildStaffRegisterFailReply(staffListErr.message))
        return true
    }
    const staffNames = (staffRows || []).map((r) => String(r.name || '').trim()).filter(Boolean)
    const canonicalName = resolveStaffName(staffName, staffNames)
    if (!canonicalName) {
        await replyMessage(event.replyToken, buildStaffRegisterFailReply(`担当者「${staffName}」が見つかりません`))
        return true
    }

    const profile = await getProfile(userId).catch(() => null)
    const { error } = await sb.from('line_staff_mappings').upsert(
        {
            staff_name: canonicalName,
            line_user_id: userId,
            line_display_name: profile?.displayName || null,
            notify_enabled: true,
        },
        { onConflict: 'staff_name' },
    )

    if (error) {
        await replyMessage(event.replyToken, buildStaffRegisterFailReply(error.message))
        return true
    }

    await replyMessage(event.replyToken, buildStaffRegisterSuccessReply(canonicalName))
    return true
}

async function handleMessage(event: LineEvent) {
    const userId = event.source.userId
    const msg = event.message
    if (!msg) return

    if (msg.type === 'text' && msg.text) {
        if (await tryHandleStaffLineRegister(event, userId, msg.text)) {
            return
        }
    }

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
            if (text === 'チャットで修理依頼') {
                // NotebookLM後の復帰: カテゴリ・症状が既にある場合はチャット受付に直接進む
                if (state.category && state.symptom) {
                    state.step = 'waiting_name'
                    conversations.set(userId, state)
                    await replyMessage(event.replyToken,
                        `修理受付を続けます（${state.category} / ${state.symptom}）\n\nお名前（会社名）をお送りください。`)
                } else {
                    conversations.set(userId, { step: 'waiting_category' })
                    await replyWithQuickReply(
                        event.replyToken,
                        '修理受付を開始します。\n\nまず、機械の種別をお選びください。',
                        [
                            ...MACHINE_CATEGORIES.map(c => ({ label: c, text: c })),
                            { label: 'その他', text: 'その他' },
                        ],
                    )
                }
            } else if (isAiSearchStart(text)) {
                conversations.set(userId, { step: 'ai_search_waiting_category' })
                await replyWithQuickReply(
                    event.replyToken,
                    'AI検索を開始します（修理依頼は行いません）。\n\nまず、機械の種別をお選びください。',
                    [
                        ...MACHINE_CATEGORIES.map(c => ({ label: c, text: c })),
                        { label: 'その他', text: 'その他' },
                    ],
                )
            } else if (isRepairTrigger(text)) {
                // 修理トリガー → まずカテゴリ選択から開始
                conversations.set(userId, { step: 'waiting_category' })
                await replyWithQuickReply(
                    event.replyToken,
                    '修理のお問い合わせありがとうございます。\n\nまず、機械の種別をお選びください。',
                    [
                        ...MACHINE_CATEGORIES.map(c => ({ label: c, text: c })),
                        { label: 'その他', text: 'その他' },
                    ],
                )
            } else {
                await replyMessage(event.replyToken,
                    'お問い合わせありがとうございます。\n\n' +
                    '【修理のご依頼】「修理依頼」とお送りいただくか、機械の故障・異常・エラー等のキーワードでも受付を開始できます。\n\n' +
                    '【AI検索のみ】まず「検索」とだけお送りください。次に機種を選び、症状を入力するとナレッジを検索します（修理受付には進みません）。')
            }
            break

        case 'ai_search_waiting_category':
            if (text === 'その他') {
                state.step = 'ai_search_waiting_category'
                state.category = undefined
                conversations.set(userId, state)
                await replyMessage(event.replyToken,
                    '機械の種別を入力してください。\n例: 「穀物乾燥機」「ボイラー」など')
                return
            }
            state.category = text
            state.step = 'ai_search_waiting_symptom'
            conversations.set(userId, state)
            await replyMessage(event.replyToken,
                `種別「${state.category}」です。\n\n続けて、症状や知りたい内容を文章でお送りください。\n例: 「火がつかない」「エラーコードが出る」`)
            break

        case 'ai_search_waiting_symptom': {
            const category = state.category || ''
            const symptom = text.trim()
            conversations.set(userId, { step: 'idle' })

            if (!DIFY_API_KEY) {
                await replyMessage(event.replyToken,
                    'AI検索機能は現在準備中です（DIFY_API_KEY 未設定）。\n\n再度お試しの場合は「検索」からお送りください。')
                break
            }
            await replyMessage(event.replyToken, 'AIでナレッジを検索しています…')
            try {
                const aiResult = await searchDify(category, symptom, userId)
                if (aiResult) {
                    const truncated = aiResult.length > 1500
                        ? aiResult.substring(0, 1500) + '\n\n…（文字数の都合で省略しています）'
                        : aiResult
                    await pushMessage(userId,
                        `【AI検索結果】\n種別: ${category || '（未指定）'}\n内容: ${symptom}\n\n${truncated}`)
                } else {
                    await pushMessage(userId, '該当する情報が見つかりませんでした。表現を変えて「検索」から再度お試しください。')
                }
            } catch (e) {
                console.error('Dify AI search-only error:', e)
                await pushMessage(userId, 'AI検索中にエラーが発生しました。しばらくしてから「検索」で再度お試しください。')
            }
            await pushMessage(userId,
                '検索を終了しました。\n\nほかに調べたいことがあれば、改めて「検索」とお送りください。\n修理のご依頼は「修理依頼」や故障に関するキーワードで受付を開始できます。')
            conversations.delete(userId)
            break
        }

        case 'waiting_category':
            if (text === 'その他') {
                state.step = 'waiting_category'
                state.category = undefined
                conversations.set(userId, state)
                await replyMessage(event.replyToken,
                    '機械の種別を入力してください。\n例: 「穀物乾燥機」「ボイラー」など')
                return
            }
            state.category = text
            state.step = 'waiting_symptom_prelim'
            conversations.set(userId, state)
            await replyMessage(event.replyToken,
                `種別「${state.category}」で承りました。\n\n次に、症状を簡単にお送りください。\n例: 「火がつかない」「温度が上がらない」「異音がする」`)
            break

        case 'waiting_symptom_prelim': {
            state.symptom = text
            if (DIFY_API_KEY) {
                state.step = 'waiting_repair_ai_confirm'
                conversations.set(userId, state)
                await replyWithQuickReply(
                    event.replyToken,
                    `症状「${text}」を承りました。\n\n類似事例をAIで検索しますか？\n緊急の場合は「スキップ」で、すぐにフォーム／チャットの選択へ進めます。`,
                    [
                        { label: 'AIで検索', text: '__REPAIR_AI_RUN__' },
                        { label: 'スキップ', text: '__REPAIR_AI_SKIP__' },
                    ],
                )
            } else {
                state.step = 'idle'
                conversations.set(userId, state)
                await showMethodChoice(event.replyToken, state)
            }
            break
        }

        case 'waiting_repair_ai_confirm': {
            const symptomText = state.symptom || ''
            if (text === '__REPAIR_AI_SKIP__' || text === 'スキップ') {
                state.step = 'idle'
                conversations.set(userId, state)
                await replyMessage(event.replyToken,
                    'AI検索をスキップしました。次のカードで受付方法をお選びください。')
                await showMethodChoiceAfterAi(userId, state)
                break
            }
            if (text === '__REPAIR_AI_RUN__' || text === 'AIで検索') {
                state.step = 'idle'
                conversations.set(userId, state)
                await replyMessage(event.replyToken, 'AIで類似事例を検索しています...')
                try {
                    const aiResult = await searchDify(state.category || '', symptomText, userId)
                    if (aiResult) {
                        const truncated = aiResult.length > 800
                            ? aiResult.substring(0, 800) + '\n\n…（続きは管理画面で確認できます）'
                            : aiResult
                        await pushMessage(userId,
                            `【AI検索結果】\n${state.category || ''} / ${symptomText}\n\n${truncated}`)
                    }
                } catch (e) {
                    console.error('Dify search error in LINE:', e)
                }
                await showMethodChoiceAfterAi(userId, state)
                break
            }
            await replyMessage(event.replyToken,
                '「AIで検索」または「スキップ」をタップしてください。')
            break
        }

        case 'waiting_name':
            state.customer_name = text
            state.step = 'waiting_model'
            conversations.set(userId, state)
            await replyMessage(event.replyToken,
                `${text} 様、ありがとうございます。\n\n次に、機械の型式（型番）をお送りください。\n不明な場合は「不明」とお送りください。`)
            break

        case 'waiting_model':
            state.model = text === '不明' ? undefined : text
            if (state.symptom) {
                // 症状は事前収集済み → そのまま登録
                state.photo_urls = []
                state.video_urls = []
                const ok = await registerRepairRequest(event, state, userId)
                state.step = ok ? 'waiting_more' : 'waiting_model'
                conversations.set(userId, state)
            } else {
                state.step = 'waiting_symptom'
                conversations.set(userId, state)
                await replyMessage(event.replyToken,
                    'ありがとうございます。\n\n症状を具体的にお送りください。\n例: 「火がつかない」「温度が上がらない」「異音がする」')
            }
            break

        case 'waiting_symptom':
            state.symptom = text
            state.photo_urls = []
            state.video_urls = []
            const success = await registerRepairRequest(event, state, userId)
            if (success) {
                state.step = 'waiting_more'
            } else {
                state.step = 'waiting_symptom'
            }
            conversations.set(userId, state)
            break

        case 'waiting_more':
            if (text === '完了' || text === '以上' || text === '終了') {
                conversations.delete(userId)
                await replyMessage(event.replyToken,
                    'ありがとうございます。担当者より折り返しご連絡いたします。')
            } else {
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

async function searchDify(category: string, symptom: string, userId: string): Promise<string | null> {
    const query = [
        category ? `機械の種別: ${category}` : '',
        `症状: ${symptom}`,
        '',
        '考えられる原因と対処方法を教えてください。',
    ].filter(Boolean).join('\n')

    const res = await fetch(`${DIFY_API_BASE}/chat-messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${DIFY_API_KEY}`,
        },
        body: JSON.stringify({
            inputs: {},
            query,
            response_mode: 'blocking',
            conversation_id: '',
            user: `line-${userId}`,
        }),
    })

    if (!res.ok) {
        const errBody = await res.text()
        console.error('Dify API error:', res.status, errBody)
        return null
    }

    const data = await res.json()
    return data.answer || null
}

async function showMethodChoiceAfterAi(userId: string, state: ConversationState) {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID || ''
    let liffUrl = process.env.NEXT_PUBLIC_LIFF_URL || (liffId ? `https://liff.line.me/${liffId}` : '')

    if (liffUrl && (state.category || state.symptom)) {
        const params = new URLSearchParams()
        if (state.category) params.set('category', state.category)
        if (state.symptom) params.set('symptom', state.symptom)
        liffUrl = `${liffUrl}?${params.toString()}`
    }

    if (liffUrl) {
        try {
            await pushRepairMethodChoice(userId, liffUrl)
        } catch (e) {
            console.error('pushRepairMethodChoice error:', e)
            await pushMessage(userId,
                '受付方法を選択してください。\n\n「チャットで修理依頼」と送信するとチャットで受付できます。')
        }
    } else {
        await pushMessage(userId,
            '「チャットで修理依頼」と送信するとチャットで受付できます。')
    }
}


async function showMethodChoice(replyToken: string, state: ConversationState) {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID || ''
    let liffUrl = process.env.NEXT_PUBLIC_LIFF_URL || (liffId ? `https://liff.line.me/${liffId}` : '')

    // カテゴリ・症状をLIFFフォームに引き継ぐ
    if (liffUrl && (state.category || state.symptom)) {
        const params = new URLSearchParams()
        if (state.category) params.set('category', state.category)
        if (state.symptom) params.set('symptom', state.symptom)
        liffUrl = `${liffUrl}?${params.toString()}`
    }

    if (liffUrl) {
        try {
            await sendRepairMethodChoice(replyToken, liffUrl)
        } catch (e) {
            console.error('sendRepairMethodChoice error:', e)
            await replyMessage(replyToken,
                '受付方法を選択してください。\n\n「チャットで修理依頼」と送信するとチャットで受付できます。')
        }
    } else {
        await replyMessage(replyToken,
            '受付方法を選択してください。\n\n「チャットで修理依頼」と送信するとチャットで受付できます。')
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

async function registerRepairRequest(event: LineEvent, state: ConversationState, userId: string): Promise<boolean> {
    const sb = getSupabase()

    let profile: Awaited<ReturnType<typeof getProfile>> = null
    try {
        profile = await getProfile(userId)
    } catch (e) {
        console.error('LINEプロフィール取得エラー:', e)
    }

    const payload = {
        received_via: 'line',
        priority: 'normal',
        status: 'received',
        customer_name: state.customer_name || profile?.displayName || 'LINE顧客',
        category: state.category?.trim() ? repairCategoryToSheetType(state.category) : null,
        symptom: state.symptom || '',
        model: state.model || null,
        line_user_id: userId,
        line_message_id: event.message?.id || null,
        photo_urls: state.photo_urls || [],
        video_urls: state.video_urls || [],
        notes: `LINE受付 (表示名: ${profile?.displayName || '不明'})`,
    }

    console.log('repair_requests INSERT payload:', JSON.stringify(payload))

    const { data, error } = await sb.from('repair_requests').insert(payload).select('id, request_no').single()

    if (error || !data) {
        console.error('修理案件登録エラー:', JSON.stringify({
            code: error?.code,
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            data,
        }))
        await replyMessage(event.replyToken,
            '申し訳ございません、受付処理中にエラーが発生しました。お手数ですがお電話にてご連絡ください。\n\nもう一度症状をお送りいただくとリトライできます。')
        return false
    }

    state.repair_request_id = data.id
    notifyRepairRequestCreated(data.id)

    try {
        await sendRepairConfirmation(userId, data.request_no, state.symptom || '', state.model)
    } catch (e) {
        console.error('受付確認Flex送信エラー:', e)
    }

    await replyMessage(event.replyToken,
        `修理受付が完了しました（受付番号: #${data.request_no}）\n\n写真や動画があればお送りください。\n完了の場合は「完了」とお送りください。`)
    return true
}
