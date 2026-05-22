import { NextResponse } from 'next/server'
import { applyRepairMarkCompleted } from '@/lib/repairMarkCompleted'
import { hasSupabaseServiceRole } from '@/lib/supabaseAdmin'
import { persistRepairStatusTransition, getRepairAdminSupabase } from '@/lib/repairStatusUpdate'

export const runtime = 'nodejs'

type Body = {
    repair_request_id?: string
    new_status?: string
    old_status?: string
}

/** 修理案件ステータス変更（service role・履歴・LINE通知） */
export async function POST(request: Request) {
    try {
        if (!hasSupabaseServiceRole()) {
            return NextResponse.json(
                {
                    error:
                        'サーバーに SUPABASE_SERVICE_ROLE_KEY が未設定です。Vercel の環境変数に設定して再デプロイしてください。',
                    code: 'missing_service_role',
                },
                { status: 503 },
            )
        }

        const body = (await request.json().catch(() => ({}))) as Body
        const repairId = String(body.repair_request_id || '').trim()
        const newStatus = String(body.new_status || '').trim()
        if (!repairId || !newStatus) {
            return NextResponse.json({ error: 'repair_request_id and new_status are required' }, { status: 400 })
        }

        const sb = getRepairAdminSupabase()
        const { data: existing, error: fetchErr } = await sb
            .from('repair_requests')
            .select('status, received_via')
            .eq('id', repairId)
            .single()

        if (fetchErr || !existing) {
            return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
        }

        const oldStatus =
            typeof body.old_status === 'string' && body.old_status.trim()
                ? body.old_status.trim()
                : String(existing.status || '')

        if (oldStatus === newStatus) {
            return NextResponse.json({ ok: true, status: newStatus, unchanged: true })
        }

        if (newStatus === 'completed') {
            const markResult = await applyRepairMarkCompleted(sb, repairId, oldStatus, null)
            return NextResponse.json({
                ok: true,
                status: 'completed',
                status_applied: true,
                previous_status: markResult.previousStatus,
                line_customer_notify: markResult.lineCustomerNotify,
            })
        }

        await persistRepairStatusTransition(
            sb,
            repairId,
            oldStatus,
            newStatus,
            String(existing.received_via || ''),
            { skipCustomerLineNotify: newStatus === 'completed' },
        )

        return NextResponse.json({
            ok: true,
            status: newStatus,
            status_applied: true,
            previous_status: oldStatus,
        })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('repair-requests set-status:', e)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
