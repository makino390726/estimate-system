import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendRepairConfirmation, pushMessage } from '@/lib/lineClient'

export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xdiqyslnokscgcuoakle.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getSupabase() {
    if (supabaseServiceKey) {
        return createClient(supabaseUrl, supabaseServiceKey)
    }
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    return createClient(supabaseUrl, anonKey)
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            customer_name,
            model,
            symptom,
            symptom_category,
            customer_phone,
            notes,
            line_user_id,
            line_display_name,
        } = body

        if (!customer_name || !symptom) {
            return NextResponse.json(
                { error: 'お名前と症状は必須です' },
                { status: 400 },
            )
        }

        const sb = getSupabase()

        const payload = {
            received_via: 'line',
            priority: 'normal',
            status: 'received',
            customer_name,
            symptom,
            symptom_category: symptom_category || null,
            model: model || null,
            customer_phone: customer_phone || null,
            line_user_id: line_user_id || null,
            line_message_id: null,
            photo_urls: [],
            video_urls: [],
            notes: [
                notes || '',
                `LINE LIFF フォーム受付 (表示名: ${line_display_name || '不明'})`,
            ].filter(Boolean).join('\n'),
        }

        console.log('LIFF repair-form INSERT payload:', JSON.stringify(payload))

        const { data, error } = await sb
            .from('repair_requests')
            .insert(payload)
            .select('id, request_no')
            .single()

        if (error || !data) {
            console.error('LIFF repair-form INSERT error:', JSON.stringify({
                code: error?.code,
                message: error?.message,
                details: error?.details,
                hint: error?.hint,
            }))
            return NextResponse.json(
                { error: '登録に失敗しました' },
                { status: 500 },
            )
        }

        if (line_user_id) {
            try {
                await sendRepairConfirmation(line_user_id, data.request_no, symptom, model)
            } catch (e) {
                console.error('LIFF受付確認送信エラー:', e)
            }
        }

        return NextResponse.json({
            ok: true,
            request_no: data.request_no,
            id: data.id,
        })
    } catch (e: any) {
        console.error('LIFF repair-form error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
