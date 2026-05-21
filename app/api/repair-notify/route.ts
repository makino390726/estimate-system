import { NextResponse } from 'next/server'
import { isLineWorksConfigured } from '@/lib/lineWorksClient'
import { notifyRepairRequestStaff } from '@/lib/repairStaffNotify'

export const runtime = 'nodejs'

type Body = { repair_request_id?: string; staff_name?: string }

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Body
        const repairRequestId = typeof body.repair_request_id === 'string' ? body.repair_request_id.trim() : ''
        const staffNameOnly = typeof body.staff_name === 'string' ? body.staff_name.trim() : ''
        if (!repairRequestId) {
            return NextResponse.json({ ok: false, error: 'repair_request_id is required' }, { status: 400 })
        }

        const result = await notifyRepairRequestStaff(repairRequestId, {
            staffNameOnly: staffNameOnly || undefined,
        })
        const payload = {
            ...result,
            debug: {
                lineWorksConfigured: isLineWorksConfigured(),
                lineworksSkipped: result.lineworks.skipped,
                lineworksReason: result.lineworks.reason,
                lineworksError: result.lineworks.error,
            },
        }
        if (!result.ok) {
            return NextResponse.json(payload, { status: 500 })
        }
        return NextResponse.json(payload)
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('repair-notify error:', e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
