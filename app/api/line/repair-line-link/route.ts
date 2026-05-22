import { NextResponse } from 'next/server'
import { getRepairAdminSupabase } from '@/lib/repairStatusUpdate'
import { linkRepairRequestToLineUser } from '@/lib/repairLineLink'

export const runtime = 'nodejs'

type Body = {
    repair_request_id?: string
    line_user_id?: string
    line_display_name?: string
}

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as Body
        const repairRequestId = String(body.repair_request_id || '').trim()
        const lineUserId = String(body.line_user_id || '').trim()
        const lineDisplayName = body.line_display_name
            ? String(body.line_display_name).trim() || null
            : null

        const sb = getRepairAdminSupabase()
        const result = await linkRepairRequestToLineUser(
            sb,
            repairRequestId,
            lineUserId,
            lineDisplayName,
        )

        if (!result.ok) {
            return NextResponse.json({ error: result.message }, { status: result.status })
        }

        return NextResponse.json({
            ok: true,
            request_no: result.requestNo,
            already_linked: result.alreadyLinked,
        })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error'
        console.error('repair-line-link error:', e)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
