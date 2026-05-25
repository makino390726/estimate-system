import { NextResponse } from 'next/server'
import { upsertStaffLineMapping } from '@/lib/lineStaffMappingDb'
import {
    isRepairStaffNotifyLineOaMode,
    REPAIR_STAFF_NOTIFY_POLICY_NOTE,
    repairStaffNotifyChannelLabel,
    getRepairStaffNotifyChannel,
} from '@/lib/repairStaffNotifyChannel'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

type Body = {
    staff_name?: string
    line_user_id?: string
    line_display_name?: string | null
}

/** 担当者本人の LIFF から LINE User ID を登録 */
export async function POST(request: Request) {
    try {
        if (!isRepairStaffNotifyLineOaMode()) {
            const ch = getRepairStaffNotifyChannel()
            return NextResponse.json(
                {
                    ok: false,
                    error: `担当者の LINE 公式連携は現在利用できません（${repairStaffNotifyChannelLabel(ch)} モード）。${REPAIR_STAFF_NOTIFY_POLICY_NOTE}`,
                },
                { status: 403 },
            )
        }
        const body = (await request.json().catch(() => ({}))) as Body
        const result = await upsertStaffLineMapping(getSupabaseAdmin(), {
            staff_name: body.staff_name,
            line_user_id: body.line_user_id,
            line_display_name: body.line_display_name,
        })
        if (!result.ok) {
            return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
        }
        return NextResponse.json({
            ok: true,
            staff_name: result.staff_name,
            line_user_id: result.line_user_id,
        })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
