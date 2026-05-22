import { NextResponse } from 'next/server'
import { notifyRepairCustomerOnCompleted } from '@/lib/repairCustomerLineNotify'
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

        await persistRepairStatusTransition(
            sb,
            repairId,
            oldStatus,
            newStatus,
            String(existing.received_via || ''),
            { skipCustomerLineNotify: newStatus === 'completed' },
        )

        let lineCustomerNotify: Awaited<ReturnType<typeof notifyRepairCustomerOnCompleted>> | null = null
        if (newStatus === 'completed') {
            lineCustomerNotify = await notifyRepairCustomerOnCompleted(sb, repairId)
        }

        return NextResponse.json({
            ok: true,
            status: newStatus,
            line_customer_notify: lineCustomerNotify,
        })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('repair-requests set-status:', e)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
