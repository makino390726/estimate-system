import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
    loadLineCustomerPrefill,
    upsertLineCustomerRegister,
    type LineCustomerRegisterInput,
} from '@/lib/customerRegisterLineUpsert'
import { isValidLineUserId } from '@/lib/lineUserId'

export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getSupabase() {
    if (supabaseServiceKey) {
        return createClient(supabaseUrl, supabaseServiceKey)
    }
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    return createClient(supabaseUrl, anonKey)
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const lineUserId = searchParams.get('line_user_id')?.trim() || ''
    if (!isValidLineUserId(lineUserId)) {
        return NextResponse.json({ error: 'line_user_id が必要です' }, { status: 400 })
    }

    try {
        const sb = getSupabase()
        const prefill = await loadLineCustomerPrefill(sb, lineUserId)
        return NextResponse.json({ ok: true, prefill })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : '取得に失敗しました'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as LineCustomerRegisterInput
        const sb = getSupabase()
        const result = await upsertLineCustomerRegister(sb, body)
        return NextResponse.json(result)
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : '登録に失敗しました'
        const status = /入力|取得|LINEユーザー|製造番号|氏名|電話|機械|機種|同じ製造番号/.test(message) ? 400 : 500
        return NextResponse.json({ ok: false, error: message }, { status })
    }
}
