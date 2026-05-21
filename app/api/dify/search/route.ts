import { NextResponse } from 'next/server'
import { buildRepairSymptomQuery } from '@/lib/repairSymptomText'
import { isDifyConfigured, searchDifyRepairKnowledge } from '@/lib/difyClient'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
    if (!isDifyConfigured()) {
        return NextResponse.json({ error: 'DIFY_API_KEY is not configured' }, { status: 500 })
    }

    try {
        const body = await request.json()
        const category = typeof body.category === 'string' ? body.category.trim() : ''
        const user_id = typeof body.user_id === 'string' ? body.user_id : ''
        const symptomText = buildRepairSymptomQuery({
            symptom: body.symptom,
            symptom_category: body.symptom_category,
            symptom_detail: body.symptom_detail,
        })

        if (!symptomText) {
            return NextResponse.json(
                { error: '症状分類または症状の詳細を入力してください' },
                { status: 400 },
            )
        }

        const result = await searchDifyRepairKnowledge({
            category,
            symptomText,
            userId: user_id || 'system-user',
        })

        if ('error' in result) {
            const status = result.error.includes('DIFY_API_KEY') ? 500 : 502
            return NextResponse.json({ error: result.error }, { status })
        }

        return NextResponse.json({
            answer: result.answer,
            conversation_id: result.conversation_id || '',
        })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('Dify search error:', e)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
