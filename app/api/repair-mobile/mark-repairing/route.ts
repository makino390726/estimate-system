import { NextResponse } from 'next/server'
import { recordRepairRepairing } from '@/lib/repairStaffConfirm'
import { getRepairAdminSupabase } from '@/lib/repairStatusUpdate'

export const runtime = 'nodejs'

type Body = { repair_request_id?: string }

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Body
        const repairRequestId = String(body.repair_request_id || '').trim()
        if (!repairRequestId) {
            return NextResponse.json({ error: 'repair_request_id is required' }, { status: 400 })
        }

        const sb = getRepairAdminSupabase()
        const result = await recordRepairRepairing(sb, repairRequestId)

        if (!result.ok) {
            return NextResponse.json({ error: result.message }, { status: 400 })
        }

        return NextResponse.json({
            ok: true,
            request_no: result.requestNo,
            status_updated: result.statusUpdated,
            already_repairing: result.alreadyRepairing,
            received_via: result.receivedVia,
        })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error'
        console.error('repair-mobile mark-repairing:', e)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
