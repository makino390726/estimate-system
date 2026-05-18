import { NextResponse } from 'next/server'
import { notifyRepairRequestStaff } from '@/lib/repairStaffNotify'

export const runtime = 'nodejs'

type Body = { repair_request_id?: string }

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Body
        const repairRequestId = typeof body.repair_request_id === 'string' ? body.repair_request_id.trim() : ''
        if (!repairRequestId) {
            return NextResponse.json({ ok: false, error: 'repair_request_id is required' }, { status: 400 })
        }

        const result = await notifyRepairRequestStaff(repairRequestId)
        if (!result.ok) {
            return NextResponse.json(result, { status: 500 })
        }
        return NextResponse.json(result)
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('repair-notify error:', e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
