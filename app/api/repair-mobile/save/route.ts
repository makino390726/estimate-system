import { NextResponse } from 'next/server'
import { repairCategoryToSheetType } from '@/lib/customerRegisterSheetTypes'
import { applyRepairMarkCompleted } from '@/lib/repairMarkCompleted'
import { hasSupabaseServiceRole } from '@/lib/supabaseAdmin'
import { getRepairAdminSupabase } from '@/lib/repairStatusUpdate'

export const runtime = 'nodejs'

type SaveBody = {
    repair_request_id?: string
    status?: string
    status_baseline?: string
    treatment_details?: string | null
    root_cause?: string | null
    repair_duration_minutes?: number | null
    visit_fee?: number | null
    labor_cost?: number | null
    repair_cost?: number | null
    customer_name?: string | null
    customer_address?: string | null
    customer_phone?: string | null
    customer_mobile?: string | null
    customer_region?: string | null
    category?: string | null
    machine_type?: string | null
    model?: string | null
    serial_no?: string | null
    manufacturing_no?: string | null
    manufacturing_year?: string | null
    usage_years?: number | null
    visit_completed_date?: string | null
    mark_completed?: boolean
    new_part?: {
        part_name?: string
        quantity?: number
        part_code?: string | null
        unit_price?: number | null
    } | null
}

function toNullable(v: unknown): string | null {
    if (v == null) return null
    const s = String(v).trim()
    return s || null
}

function parseMoney(v: unknown): number | null {
    if (v == null || v === '') return null
    const n = Number(String(v).replace(/,/g, '').trim())
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

function isMarkCompletedFlag(v: unknown): boolean {
    return v === true || v === 'true' || v === 1 || v === '1'
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

        const body = (await request.json()) as SaveBody
        const repairId = typeof body.repair_request_id === 'string' ? body.repair_request_id.trim() : ''
        if (!repairId) {
            return NextResponse.json({ error: 'repair_request_id is required' }, { status: 400 })
        }

        const sb = getRepairAdminSupabase()
        const { data: existing, error: fetchErr } = await sb
            .from('repair_requests')
            .select('status, received_via, line_user_id')
            .eq('id', repairId)
            .single()

        if (fetchErr || !existing) {
            return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
        }

        const baseline =
            typeof body.status_baseline === 'string' && body.status_baseline.trim()
                ? body.status_baseline.trim()
                : String(existing.status || 'received')
        const markCompleted = isMarkCompletedFlag(body.mark_completed)

        let newStatus =
            typeof body.status === 'string' && body.status.trim() ? body.status.trim() : baseline
        if (markCompleted) {
            newStatus = 'completed'
        }

        if (body.customer_name !== undefined && !toNullable(body.customer_name)) {
            return NextResponse.json({ error: '顧客名は必須です' }, { status: 400 })
        }

        let markResult: Awaited<ReturnType<typeof applyRepairMarkCompleted>> | null = null
        if (markCompleted) {
            markResult = await applyRepairMarkCompleted(
                sb,
                repairId,
                baseline,
                body.visit_completed_date,
            )
        }

        const updatePayload: Record<string, unknown> = {
            customer_name: body.customer_name !== undefined ? toNullable(body.customer_name) : undefined,
            customer_address:
                body.customer_address !== undefined ? toNullable(body.customer_address) : undefined,
            customer_phone: body.customer_phone !== undefined ? toNullable(body.customer_phone) : undefined,
            customer_mobile: body.customer_mobile !== undefined ? toNullable(body.customer_mobile) : undefined,
            customer_region: body.customer_region !== undefined ? toNullable(body.customer_region) : undefined,
            category:
                body.category !== undefined
                    ? toNullable(repairCategoryToSheetType(String(body.category)))
                    : undefined,
            machine_type: body.machine_type !== undefined ? toNullable(body.machine_type) : undefined,
            model: body.model !== undefined ? toNullable(body.model) : undefined,
            serial_no: body.serial_no !== undefined ? toNullable(body.serial_no) : undefined,
            manufacturing_no:
                body.manufacturing_no !== undefined ? toNullable(body.manufacturing_no) : undefined,
            manufacturing_year:
                body.manufacturing_year !== undefined ? toNullable(body.manufacturing_year) : undefined,
            usage_years: body.usage_years !== undefined ? body.usage_years : undefined,
            treatment_details: body.treatment_details !== undefined ? toNullable(body.treatment_details) : undefined,
            root_cause: body.root_cause !== undefined ? toNullable(body.root_cause) : undefined,
            repair_duration_minutes:
                body.repair_duration_minutes !== undefined ? body.repair_duration_minutes : undefined,
        }

        const visitFee = body.visit_fee !== undefined ? parseMoney(body.visit_fee) : undefined
        const laborCost = body.labor_cost !== undefined ? parseMoney(body.labor_cost) : undefined
        if (visitFee != null) updatePayload.visit_fee = visitFee
        if (laborCost != null) updatePayload.labor_cost = laborCost
        if (visitFee != null || laborCost != null) {
            updatePayload.repair_cost = (visitFee ?? 0) + (laborCost ?? 0)
        } else if (body.repair_cost !== undefined) {
            const rc = parseMoney(body.repair_cost)
            if (rc != null) updatePayload.repair_cost = rc
        }

        if (!markCompleted && body.visit_completed_date) {
            updatePayload.visit_completed_date = toNullable(body.visit_completed_date)
        }

        const statusChanged = !markCompleted && newStatus !== String(existing.status || baseline)
        if (statusChanged) {
            updatePayload.status = newStatus
        }

        const cleaned = Object.fromEntries(
            Object.entries(updatePayload).filter(([, v]) => v !== undefined),
        )

        const fieldWarnings: string[] = []
        if (Object.keys(cleaned).length > 0) {
            const { error: upErr } = await sb.from('repair_requests').update(cleaned).eq('id', repairId)
            if (upErr) {
                const msg = upErr.message || ''
                const optionalColumn =
                    /visit_fee|labor_cost|customer_acknowledged/i.test(msg) && markCompleted
                if (optionalColumn) {
                    fieldWarnings.push(`付帯情報の一部は保存できませんでした: ${msg}`)
                } else {
                    throw upErr
                }
            }
        }

        if (statusChanged) {
            const { error: histErr } = await sb.from('repair_status_history').insert({
                repair_request_id: repairId,
                old_status: baseline,
                new_status: newStatus,
            })
            if (histErr) console.warn('repair_status_history:', histErr.message)
        }

        const { data: updated } = await sb.from('repair_requests').select('status, line_user_id').eq('id', repairId).single()
        const finalStatus = updated?.status ?? (markCompleted ? 'completed' : newStatus)

        return NextResponse.json({
            ok: true,
            status: finalStatus,
            status_applied: markCompleted ? finalStatus === 'completed' : statusChanged,
            previous_status: markResult?.previousStatus ?? baseline,
            line_customer_notify: markResult?.lineCustomerNotify ?? null,
            field_warnings: fieldWarnings.length > 0 ? fieldWarnings : undefined,
        })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('repair-mobile save:', e)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
