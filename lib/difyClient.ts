const DIFY_API_BASE = process.env.DIFY_API_BASE || 'https://api.dify.ai/v1'
const DIFY_API_KEY = process.env.DIFY_API_KEY || ''
const DIFY_APP_MODE = (process.env.DIFY_APP_MODE || 'chat').toLowerCase()

export function isDifyConfigured(): boolean {
    return Boolean(DIFY_API_KEY)
}

function parseDifyInputsJson(): Record<string, unknown> {
    const raw = process.env.DIFY_INPUTS_JSON?.trim()
    if (!raw) return {}
    try {
        const parsed = JSON.parse(raw) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>
        }
        console.warn('DIFY_INPUTS_JSON must be a JSON object, ignoring')
    } catch (e) {
        console.warn('DIFY_INPUTS_JSON parse error:', e)
    }
    return {}
}

export function formatDifyErrorMessage(status: number, errBody: string): string {
    let message = ''
    try {
        const j = JSON.parse(errBody) as { message?: string; code?: string }
        message = j.message || ''
    } catch {
        message = errBody
    }

    const lower = message.toLowerCase()
    if (lower.includes('model is not configured') || lower.includes('model is not')) {
        return [
            'DifyアプリでAIモデルが未設定です。',
            'Dify Studio → SANSHUエンジニア → LLMノードでGeminiを選択 →',
            '設定→モデルプロバイダーでGoogle APIキー登録 → 公開。',
            'チャットフロー（ワークフロー）の場合は Vercel に DIFY_APP_MODE=workflow を設定し、',
            'APIアクセスのキーを DIFY_API_KEY に設定して再デプロイしてください。',
        ].join(' ')
    }

    if (message) return `AI検索に失敗しました: ${message}`
    if (errBody && errBody.length < 200) return `AI検索に失敗しました: ${errBody}`
    return `AI検索に失敗しました（HTTP ${status}）`
}

/** LIFF・顧客向け（長い設定手順は出さない） */
export function toEndUserRepairAiError(apiError: string): string {
    const t = apiError.toLowerCase()
    if (
        t.includes('モデルが未設定') ||
        t.includes('model is not') ||
        t.includes('dify_api_key') ||
        t.includes('not configured')
    ) {
        return 'AI検索は現在ご利用いただけません。下の「修理を依頼する」から受付は可能です。'
    }
    return 'AI検索に失敗しました。しばらくしてから再度お試しください。'
}

export type DifySearchParams = {
    category: string
    symptomText: string
    userId: string
}

function buildQuery(category: string, symptomText: string): string {
    return [
        category ? `機械の種別: ${category}` : '',
        `症状: ${symptomText}`,
        '',
        '考えられる原因と対処方法を教えてください。',
    ]
        .filter(Boolean)
        .join('\n')
}

async function callDifyChat(query: string, userId: string): Promise<Response> {
    return fetch(`${DIFY_API_BASE}/chat-messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${DIFY_API_KEY}`,
        },
        body: JSON.stringify({
            inputs: parseDifyInputsJson(),
            query,
            response_mode: 'blocking',
            conversation_id: '',
            user: userId,
        }),
    })
}

async function callDifyWorkflow(query: string, userId: string): Promise<Response> {
    const queryKey = process.env.DIFY_WORKFLOW_QUERY_INPUT || 'query'
    const inputs = { ...parseDifyInputsJson(), [queryKey]: query }
    return fetch(`${DIFY_API_BASE}/workflows/run`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${DIFY_API_KEY}`,
        },
        body: JSON.stringify({
            inputs,
            response_mode: 'blocking',
            user: userId,
        }),
    })
}

function extractAnswer(data: Record<string, unknown>, mode: string): string {
    if (mode === 'workflow') {
        const outputs = data.data as { outputs?: Record<string, unknown> } | undefined
        const out = outputs?.outputs
        if (out && typeof out === 'object') {
            for (const key of ['text', 'answer', 'result', 'output']) {
                const v = out[key]
                if (typeof v === 'string' && v.trim()) return v
            }
            const first = Object.values(out).find((v) => typeof v === 'string' && String(v).trim())
            if (typeof first === 'string') return first
        }
        return ''
    }
    return typeof data.answer === 'string' ? data.answer : ''
}

/**
 * Dify で修理ナレッジ検索。失敗時は null と errorMessage。
 */
export async function searchDifyRepairKnowledge(
    params: DifySearchParams,
): Promise<{ answer: string; conversation_id?: string } | { error: string }> {
    if (!DIFY_API_KEY) {
        return { error: 'DIFY_API_KEY is not configured' }
    }

    const query = buildQuery(params.category, params.symptomText)
    const userId = params.userId || 'system-user'
    const mode = DIFY_APP_MODE === 'workflow' ? 'workflow' : 'chat'

    const res =
        mode === 'workflow'
            ? await callDifyWorkflow(query, userId)
            : await callDifyChat(query, userId)

    if (!res.ok) {
        const errBody = await res.text()
        console.error('Dify API error:', res.status, errBody, 'mode=', mode)
        return { error: formatDifyErrorMessage(res.status, errBody) }
    }

    const data = (await res.json()) as Record<string, unknown>
    const answer = extractAnswer(data, mode)
    if (!answer.trim()) {
        return { error: 'AI検索は成功しましたが、回答が空でした。Difyアプリの出力設定を確認してください。' }
    }

    return {
        answer,
        conversation_id:
            typeof data.conversation_id === 'string' ? data.conversation_id : undefined,
    }
}
