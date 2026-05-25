import { NextResponse } from 'next/server'
import { getLineConfig } from '@/lib/lineClient'
import { applyRepairMarkCompleted } from '@/lib/repairMarkCompleted'
import { hasSupabaseServiceRole } from '@/lib/supabaseAdmin'
import { getRepairAdminSupabase } from '@/lib/repairStatusUpdate'

export const runtime = 'nodejs'

type Body = {
    repair_request_id?: string
    status_baseline?: string
    customer_name?: string | null
    treatment_details?: string | null
    root_cause?: string | null
    repair_duration_minutes?: number | null
    serial_no?: string | null
    manufacturing_no?: string | null
    visit_completed_date?: string | null
}

function toNullable(v: unknown): string | null {
    if (v == null) return null
    const s = String(v).trim()
    return s || null
}

/** 完了報告送信: ステータス completed 確定 + 顧客LINE + 担当者LINE WORKS */
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
        if (!repairId) {
            return NextResponse.json({ error: 'repair_request_id is required' }, { status: 400 })
        }

        const sb = getRepairAdminSupabase()
        const { data: existing, error: fetchErr } = await sb
            .from('repair_requests')
            .select('status, customer_name')
            .eq('id', repairId)
            .single()

        if (fetchErr || !existing) {
            return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
        }

        const baseline =
            typeof body.status_baseline === 'string' && body.status_baseline.trim()
                ? body.status_baseline.trim()
                : String(existing.status || 'received')

        const currentStatus = String(existing.status || '')
        if (currentStatus === 'completed') {
            return NextResponse.json(
                { error: `すでに完了報告済み、または案件完了です（現在: ${currentStatus}）` },
                { status: 400 },
            )
        }

        const customerName =
            body.customer_name !== undefined ? toNullable(body.customer_name) : existing.customer_name
        if (!customerName) {
            return NextResponse.json({ error: '顧客名は必須です' }, { status: 400 })
        }

        const markResult = await applyRepairMarkCompleted(
            sb,
            repairId,
            baseline,
            body.visit_completed_date,
        )

        const updatePayload: Record<string, unknown> = { customer_name: customerName }
        if (body.treatment_details !== undefined) {
            updatePayload.treatment_details = toNullable(body.treatment_details)
        }
        if (body.root_cause !== undefined) {
            updatePayload.root_cause = toNullable(body.root_cause)
        }
        if (body.repair_duration_minutes !== undefined) {
            updatePayload.repair_duration_minutes = body.repair_duration_minutes
        }
        if (body.serial_no !== undefined) {
            updatePayload.serial_no = toNullable(body.serial_no)
        }
        if (body.manufacturing_no !== undefined) {
            updatePayload.manufacturing_no = toNullable(body.manufacturing_no)
        }

        const fieldWarnings: string[] = []
        if (Object.keys(updatePayload).length > 0) {
            const { error: upErr } = await sb.from('repair_requests').update(updatePayload).eq('id', repairId)
            if (upErr) {
                fieldWarnings.push(`付帯情報の保存: ${upErr.message}`)
            }
        }

        const { data: updated } = await sb
            .from('repair_requests')
            .select('status, line_user_id')
            .eq('id', repairId)
            .single()

        const lineCfg = getLineConfig()

        return NextResponse.json({
            ok: true,
            status: updated?.status ?? 'completed',
            status_applied: updated?.status === 'completed',
            previous_status: markResult.previousStatus,
            line_customer_notify: markResult.lineCustomerNotify,
            line_works_notify: markResult.lineWorksNotify,
            line_channel_token_set: Boolean(lineCfg.channelAccessToken),
            field_warnings: fieldWarnings.length > 0 ? fieldWarnings : undefined,
        })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('repair-requests complete-report:', e)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
