import { NextResponse } from 'next/server'
import { recordRepairOfficeSalesConfirmed } from '@/lib/repairOfficeSalesConfirm'
import { hasSupabaseServiceRole } from '@/lib/supabaseAdmin'
import { getRepairAdminSupabase } from '@/lib/repairStatusUpdate'

export const runtime = 'nodejs'

type Body = {
    repair_request_id?: string
    confirmed_by?: string | null
}

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
        const repairRequestId = String(body.repair_request_id || '').trim()
        if (!repairRequestId) {
            return NextResponse.json({ error: 'repair_request_id is required' }, { status: 400 })
        }

        const sb = getRepairAdminSupabase()
        const result = await recordRepairOfficeSalesConfirmed(
            sb,
            repairRequestId,
            body.confirmed_by,
        )

        if (!result.ok) {
            return NextResponse.json({ error: result.message }, { status: 400 })
        }

        return NextResponse.json({
            ok: true,
            request_no: result.requestNo,
            already_confirmed: result.alreadyConfirmed,
            confirmed_at: result.confirmedAt,
        })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('repair-sales-processing office-confirm:', e)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
