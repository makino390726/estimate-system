import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const DIFY_API_BASE = process.env.DIFY_API_BASE || 'https://api.dify.ai/v1'
const DIFY_API_KEY = process.env.DIFY_API_KEY || ''

export async function POST(request: Request) {
    if (!DIFY_API_KEY) {
        return NextResponse.json({ error: 'DIFY_API_KEY is not configured' }, { status: 500 })
    }

    try {
        const { category, symptom, user_id } = await request.json()

        if (!symptom) {
            return NextResponse.json({ error: '症状を入力してください' }, { status: 400 })
        }

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
                user: user_id || 'system-user',
            }),
        })

        if (!res.ok) {
            const errBody = await res.text()
            console.error('Dify API error:', res.status, errBody)
            return NextResponse.json({ error: 'AI検索に失敗しました' }, { status: 502 })
        }

        const data = await res.json()

        return NextResponse.json({
            answer: data.answer || '',
            conversation_id: data.conversation_id || '',
        })
    } catch (e: any) {
        console.error('Dify search error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
