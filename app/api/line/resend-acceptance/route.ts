import { NextResponse } from 'next/server'
import { sendRepairAcceptLineConfirmation } from '@/lib/repairLineAcceptNotify'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

type Body = { repair_request_id?: string }

/** 修理受付確認LINEの再送（設定確認・テスト用） */
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Body
        const repairId = String(body.repair_request_id || '').trim()
        if (!repairId) {
            return NextResponse.json({ error: 'repair_request_id is required' }, { status: 400 })
        }

        const sb = getSupabaseAdmin()
        const { data: repair, error } = await sb
            .from('repair_requests')
            .select('id, request_no, line_user_id, symptom, model, customer_name')
            .eq('id', repairId)
            .single()

        if (error || !repair) {
            return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
        }

        const result = await sendRepairAcceptLineConfirmation(
            repair.line_user_id,
            repair.request_no,
            repair.symptom || '',
            { customerName: repair.customer_name, model: repair.model },
        )

        return NextResponse.json({
            ok: result.ok,
            request_no: repair.request_no,
            line_confirmation: result,
        })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('line resend-acceptance:', e)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
